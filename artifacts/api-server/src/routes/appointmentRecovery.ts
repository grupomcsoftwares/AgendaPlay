import { Router } from "express";

export const RECOVERABLE_APPOINTMENT_STATUSES = [
  "pending",
  "confirmed",
  "pending_payment",
  "in_progress",
] as const;

const recoverableStatuses = new Set<string>(RECOVERABLE_APPOINTMENT_STATUSES);
const GENERIC_VERIFICATION_ERROR = "Não foi possível validar os dados informados.";

export interface AppointmentRecoveryInput {
  shopId: string;
  phone: string;
  verificationToken: string;
}

export type AppointmentRecoveryParseResult =
  | { success: true; data: AppointmentRecoveryInput }
  | { success: false };

export interface RecoverableAppointment {
  status: string;
  cancelToken: string | null;
  notes?: string | null;
}

export interface AppointmentRecoveryCandidate<T extends RecoverableAppointment> {
  appointment: T;
  linkedClientPhone: string | null;
}

interface AppointmentRecoveryDependencies<T extends RecoverableAppointment> {
  parseBody: (body: unknown) => AppointmentRecoveryParseResult;
  findVerificationAppointment: (
    shopId: string,
    verificationToken: string,
  ) => Promise<AppointmentRecoveryCandidate<T> | undefined>;
  listActiveAppointments: (
    shopId: string,
  ) => Promise<AppointmentRecoveryCandidate<T>[]>;
  formatAppointment: (appointment: T) => unknown;
}

function normalizePhone(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function candidatePhone<T extends RecoverableAppointment>(
  candidate: AppointmentRecoveryCandidate<T>,
): string {
  const notePhone = candidate.appointment.notes?.match(/Tel:\s*([^.]+)/i)?.[1];
  return normalizePhone(notePhone || candidate.linkedClientPhone);
}

export function createAppointmentRecoveryRouter<T extends RecoverableAppointment>(
  dependencies: AppointmentRecoveryDependencies<T>,
) {
  const router = Router();

  router.post("/appointments/recover", async (req, res): Promise<void> => {
    const parsed = dependencies.parseBody(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Informe o telefone e os dados de verificação." });
      return;
    }

    const suppliedPhone = normalizePhone(parsed.data.phone);
    if (suppliedPhone.length < 10) {
      res.status(400).json({ error: "Informe um telefone válido." });
      return;
    }

    const verified = await dependencies.findVerificationAppointment(
      parsed.data.shopId,
      parsed.data.verificationToken,
    );

    if (
      !verified ||
      !recoverableStatuses.has(verified.appointment.status) ||
      candidatePhone(verified) !== suppliedPhone
    ) {
      res.status(404).json({ error: GENERIC_VERIFICATION_ERROR });
      return;
    }

    const recovered = (await dependencies.listActiveAppointments(parsed.data.shopId))
      .filter(({ appointment, ...candidate }) =>
        recoverableStatuses.has(appointment.status) &&
        candidatePhone({ appointment, ...candidate }) === suppliedPhone &&
        Boolean(appointment.cancelToken),
      )
      .map(({ appointment }) => dependencies.formatAppointment(appointment));

    res.json(recovered);
  });

  return router;
}