import { getPostgresBaseRecordTable, postgresBaseRecordIndexes } from '@credo-ts/drizzle-storage'
import { didcommConnection } from '@credo-ts/drizzle-storage/didcomm/postgres'
import { foreignKey, pgTable, text } from 'drizzle-orm/pg-core'

export const pushNotificationsFcm = pgTable(
  'PushNotificationsFcm',
  {
    ...getPostgresBaseRecordTable(),

    deviceToken: text('device_token'),
    devicePlatform: text('device_platform'),

    firebaseProjectId: text('firebase_project_id'),

    connectionId: text('connection_id').notNull(),
  },
  (table) => [
    ...postgresBaseRecordIndexes(table, 'pushNotificationsFcm'),
    foreignKey({
      columns: [table.contextCorrelationId, table.connectionId],
      foreignColumns: [didcommConnection.contextCorrelationId, didcommConnection.id],
    }).onDelete('cascade'),
  ]
)
