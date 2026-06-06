import { Router, type IRouter } from "express";
import { eq, ilike, and } from "drizzle-orm";
import { db, clientsTable } from "@workspace/db";
import {
  ListClientsQueryParams,
  CreateClientBody,
  GetClientParams,
  UpdateClientParams,
  UpdateClientBody,
  DeleteClientParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/clients", async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const query = ListClientsQueryParams.safeParse(req.query);
  let clients;
  if (query.success && query.data.search) {
    clients = await db
      .select()
      .from(clientsTable)
      .where(and(eq(clientsTable.userId, userId), ilike(clientsTable.name, `%${query.data.search}%`)))
      .orderBy(clientsTable.name);
  } else {
    clients = await db.select().from(clientsTable)
      .where(eq(clientsTable.userId, userId))
      .orderBy(clientsTable.name);
  }
  res.json(clients.map((c) => ({
    ...c,
    createdAt: c.createdAt.toISOString(),
  })));
});

router.post("/clients", async (req, res): Promise<void> => {
  const parsed = CreateClientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = req.session.userId!;
  const [client] = await db.insert(clientsTable).values({ ...parsed.data, userId }).returning();
  res.status(201).json({ ...client, createdAt: client.createdAt.toISOString() });
});

router.get("/clients/:id", async (req, res): Promise<void> => {
  const params = GetClientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = req.session.userId!;
  const [client] = await db.select().from(clientsTable)
    .where(and(eq(clientsTable.id, params.data.id), eq(clientsTable.userId, userId)));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  res.json({ ...client, createdAt: client.createdAt.toISOString() });
});

router.patch("/clients/:id", async (req, res): Promise<void> => {
  const params = UpdateClientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateClientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = req.session.userId!;
  const [client] = await db
    .update(clientsTable)
    .set(parsed.data)
    .where(and(eq(clientsTable.id, params.data.id), eq(clientsTable.userId, userId)))
    .returning();
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  res.json({ ...client, createdAt: client.createdAt.toISOString() });
});

router.delete("/clients/:id", async (req, res): Promise<void> => {
  const params = DeleteClientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = req.session.userId!;
  const [client] = await db.delete(clientsTable)
    .where(and(eq(clientsTable.id, params.data.id), eq(clientsTable.userId, userId)))
    .returning();
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
