import { getPostgresBaseRecordTable, postgresBaseRecordIndexes } from '@credo-ts/drizzle-storage'
import { didcommConnection } from '@credo-ts/drizzle-storage/build/didcomm/connection-record/postgres'
import { foreignKey } from 'drizzle-orm/pg-core'
import { pgTable, text } from 'drizzle-orm/pg-core'

export const pushNotificationsFcm = pgTable(
  'PushNotificationsFcm',
  {
    ...getPostgresBaseRecordTable(),

    deviceToken: text('device_token'),
    devicePlatform: text('device_platform'),

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
