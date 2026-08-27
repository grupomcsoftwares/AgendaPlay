import { db } from "@workspace/db";
import {
  adminPushSubscriptionsTable,
  appointmentsTable,
  barberServicesTable,
  barbersTable,
  clientReengagementPushSubscriptionsTable,
  clientsTable,
  clientSubscriptionsTable,
  comboDiscountsTable,
  formerAccountDocumentsTable,
  formerAccountPhonesTable,
  loyaltyPointsTable,
  nativePushSubscriptionsTable,
  onlinePresenceTable,
  pushSubscriptionsTable,
  queueTable,
  serviceDayPricingTable,
  servicesTable,
  settingsTable,
  slugRedirectsTable,
  subscriptionPlansTable,
  usersTable,
  waitlistTable,
} from "@workspace/db";
import { eq, inArray, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { getAccountPhoneHash, normalizeAccountPhone } from "../lib/phoneHistory.js";
import { logger } from "../lib/logger.js";
import { getAccountStatus } from "../routes/accountStatus.js";
import { getUncachableStripeClient } from "../stripeClient.js";
import { withAccountLifecycleLock } from "./accountLifecycleLock.js";

type DeleteAccountOptions = {
  onlyIfDeletionDue?: boolean;
  cancelStripeSubscriptions?: boolean;
};

export class StripeDeletionSafetyError extends Error {}

function isStripeResourceMissing(error: unknown): boolean {
  return (error as { code?: string }).code === "resource_missing";
}

async function retrieveOrIgnoreMissing<T>(callback: () => Promise<T>): Promise<T | null> {
  try {
    return await callback();
  } catch (error) {
    if (isStripeResourceMissing(error)) return null;
    throw error;
  }
}

async function prepareStripeForDeletion(
  user: typeof usersTable.$inferSelect,
  options: DeleteAccountOptions,
): Promise<boolean> {
  const hasStripeReferences = Boolean(
    user.stripeCustomerId
    || user.stripeSubscriptionId
    || user.firstMonthDiscountCheckoutSessionId,
  );
  if (!hasStripeReferences) return true;

  try {
    const stripe = await getUncachableStripeClient();
    const subscriptions = new Map<string, Stripe.Subscription>();
    const inspectedCheckoutSessions = new Set<string>();

    const inspectCheckoutSession = async (
      checkoutSession: Stripe.Checkout.Session,
    ): Promise<boolean> => {
      inspectedCheckoutSessions.add(checkoutSession.id);
      if (checkoutSession.status === "open") {
        if (!options.cancelStripeSubscriptions) return false;
        await stripe.checkout.sessions.expire(checkoutSession.id);
      }
      if (
        checkoutSession.status === "complete"
        && !checkoutSession.subscription
        && options.onlyIfDeletionDue
      ) {
        return false;
      }
      if (checkoutSession.subscription) {
        const subscription =
          typeof checkoutSession.subscription === "string"
            ? await retrieveOrIgnoreMissing(() =>
                stripe.subscriptions.retrieve(checkoutSession.subscription as string)
              )
            : checkoutSession.subscription;
        if (subscription) subscriptions.set(subscription.id, subscription);
      }
      return true;
    };

    if (user.firstMonthDiscountCheckoutSessionId) {
      const checkoutSession = await retrieveOrIgnoreMissing(() =>
        stripe.checkout.sessions.retrieve(
          user.firstMonthDiscountCheckoutSessionId!,
          { expand: ["subscription"] },
        )
      );
      if (checkoutSession && !await inspectCheckoutSession(checkoutSession)) {
        return false;
      }
    }

    if (user.stripeCustomerId) {
      const checkoutSessions = await retrieveOrIgnoreMissing(() =>
        stripe.checkout.sessions.list({
          customer: user.stripeCustomerId!,
          limit: 100,
        })
      );
      for (const checkoutSession of checkoutSessions?.data ?? []) {
        if (
          !inspectedCheckoutSessions.has(checkoutSession.id)
          && !await inspectCheckoutSession(checkoutSession)
        ) {
          return false;
        }
      }

      if (options.onlyIfDeletionDue) {
        const invoices = await retrieveOrIgnoreMissing(() =>
          stripe.invoices.list({
            customer: user.stripeCustomerId!,
            status: "paid",
            limit: 1,
          })
        );
        const paidInvoice = invoices?.data[0];
        if (paidInvoice) {
          await db
            .update(usersTable)
            .set({
              hasEverPaid: true,
              firstPaidAt: new Date(paidInvoice.created * 1000),
            })
            .where(eq(usersTable.id, user.id));
          return false;
        }
      }

      const customerSubscriptions = await retrieveOrIgnoreMissing(() =>
        stripe.subscriptions.list({
          customer: user.stripeCustomerId!,
          status: "all",
          limit: 100,
        })
      );
      for (const subscription of customerSubscriptions?.data ?? []) {
        subscriptions.set(subscription.id, subscription);
      }
    }

    if (user.stripeSubscriptionId && !subscriptions.has(user.stripeSubscriptionId)) {
      const storedSubscription = await retrieveOrIgnoreMissing(() =>
        stripe.subscriptions.retrieve(user.stripeSubscriptionId!)
      );
      if (storedSubscription) {
        subscriptions.set(storedSubscription.id, storedSubscription);
      }
    }

    const nonTerminalSubscriptions = [...subscriptions.values()].filter(
      (subscription) =>
        subscription.status !== "canceled"
        && subscription.status !== "incomplete_expired",
    );

    if (options.onlyIfDeletionDue && nonTerminalSubscriptions.length > 0) {
      return false;
    }

    if (options.cancelStripeSubscriptions) {
      for (const subscription of nonTerminalSubscriptions) {
        await retrieveOrIgnoreMissing(() =>
          stripe.subscriptions.cancel(subscription.id)
        );
      }
    }

    return true;
  } catch (error) {
    if (options.onlyIfDeletionDue) {
      logger.warn(
        { err: error, userId: user.id },
        "Skipping account deletion because Stripe state could not be verified",
      );
      return false;
    }
    throw new StripeDeletionSafetyError(
      "Stripe state could not be reconciled before account deletion",
    );
  }
}

async function deleteAccountDataLocked(
  userId: string,
  options: DeleteAccountOptions = {},
): Promise<boolean> {
  const [previewUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!previewUser) return false;
  if (options.onlyIfDeletionDue && !getAccountStatus(previewUser).deletionDue) {
    return false;
  }
  if (!await prepareStripeForDeletion(previewUser, options)) {
    return false;
  }

  const optionalTableResult = await db.execute<{ tableName: string }>(sql`
    select table_name as "tableName"
    from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'admin_push_subscriptions',
        'client_reengagement_push_subscriptions',
        'native_push_subscriptions',
        'online_presence',
        'session',
        'waitlist',
        'former_account_phones'
      )
  `);
  const optionalTables = new Set(
    optionalTableResult.rows.map((row) => row.tableName),
  );

  return db.transaction(async (tx) => {
    const [user] = await tx
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .for("update")
      .limit(1);

    if (!user) return false;
    if (options.onlyIfDeletionDue && !getAccountStatus(user).deletionDue) {
      return false;
    }

    const phone = normalizeAccountPhone(user.phone);
    if (phone && optionalTables.has("former_account_phones")) {
      const phoneHash = getAccountPhoneHash(phone);
      await tx
        .insert(formerAccountPhonesTable)
        .values({
          phoneHash,
          lastDeletedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: formerAccountPhonesTable.phoneHash,
          set: { lastDeletedAt: new Date() },
        });
    }

    const accountAppointments = await tx
      .select({ cancelToken: appointmentsTable.cancelToken })
      .from(appointmentsTable)
      .where(eq(appointmentsTable.userId, userId));
    const accountBarbers = await tx
      .select({ id: barbersTable.id })
      .from(barbersTable)
      .where(eq(barbersTable.userId, userId));
    const accountServices = await tx
      .select({ id: servicesTable.id })
      .from(servicesTable)
      .where(eq(servicesTable.userId, userId));

    const cancelTokens = accountAppointments
      .map((appointment) => appointment.cancelToken)
      .filter((token): token is string => Boolean(token));
    const barberIds = accountBarbers.map((barber) => barber.id);
    const serviceIds = accountServices.map((service) => service.id);

    await tx.delete(queueTable).where(eq(queueTable.userId, userId));
    if (optionalTables.has("waitlist")) {
      await tx.delete(waitlistTable).where(eq(waitlistTable.userId, userId));
    }
    await tx.delete(clientSubscriptionsTable).where(eq(clientSubscriptionsTable.userId, userId));
    await tx.delete(loyaltyPointsTable).where(eq(loyaltyPointsTable.userId, userId));
    if (optionalTables.has("admin_push_subscriptions")) {
      await tx
        .delete(adminPushSubscriptionsTable)
        .where(eq(adminPushSubscriptionsTable.userId, userId));
    }
    if (optionalTables.has("native_push_subscriptions")) {
      await tx
        .delete(nativePushSubscriptionsTable)
        .where(eq(nativePushSubscriptionsTable.userId, userId));
    }
    if (optionalTables.has("client_reengagement_push_subscriptions")) {
      await tx
        .delete(clientReengagementPushSubscriptionsTable)
        .where(eq(clientReengagementPushSubscriptionsTable.userId, userId));
    }
    if (cancelTokens.length > 0) {
      await tx
        .delete(pushSubscriptionsTable)
        .where(inArray(pushSubscriptionsTable.cancelToken, cancelTokens));
    }
    await tx.delete(appointmentsTable).where(eq(appointmentsTable.userId, userId));
    await tx.delete(clientsTable).where(eq(clientsTable.userId, userId));
    await tx.delete(subscriptionPlansTable).where(eq(subscriptionPlansTable.userId, userId));
    await tx.delete(comboDiscountsTable).where(eq(comboDiscountsTable.userId, userId));
    await tx.delete(serviceDayPricingTable).where(eq(serviceDayPricingTable.userId, userId));
    if (barberIds.length > 0) {
      await tx
        .delete(barberServicesTable)
        .where(inArray(barberServicesTable.barberId, barberIds));
    }
    if (serviceIds.length > 0) {
      await tx
        .delete(barberServicesTable)
        .where(inArray(barberServicesTable.serviceId, serviceIds));
    }
    await tx.delete(servicesTable).where(eq(servicesTable.userId, userId));
    await tx.delete(barbersTable).where(eq(barbersTable.userId, userId));
    await tx.delete(slugRedirectsTable).where(eq(slugRedirectsTable.userId, userId));
    await tx.delete(settingsTable).where(eq(settingsTable.userId, userId));
    if (optionalTables.has("online_presence")) {
      await tx.delete(onlinePresenceTable).where(eq(onlinePresenceTable.userId, userId));
    }
    if (optionalTables.has("session")) {
      await tx.execute(sql`delete from "session" where "sess" ->> 'userId' = ${userId}`);
    }
    await tx.delete(usersTable).where(eq(usersTable.id, userId));
    return true;
  });
}

export async function deleteAccountData(
  userId: string,
  options: DeleteAccountOptions = {},
): Promise<boolean> {
  return withAccountLifecycleLock(
    userId,
    () => deleteAccountDataLocked(userId, options),
  );
}