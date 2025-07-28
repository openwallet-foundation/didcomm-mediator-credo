import { getSqliteBaseRecordTable, sqliteBaseRecordIndexes } from '@credo-ts/drizzle-storage'
import { didcommConnection } from '@credo-ts/drizzle-storage/didcomm/connection/sqlite'
import { foreignKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const pushNotificationsFcm = sqliteTable(
  'PushNotificationsFcm',
  {
    ...getSqliteBaseRecordTable(),

    deviceToken: text('device_token'),
    devicePlatform: text('device_platform'),

    connectionId: text('connection_id').notNull(),
  },
  (table) => [
    ...sqliteBaseRecordIndexes(table, 'pushNotificationsFcm'),
    foreignKey({
      columns: [table.connectionId, table.contextCorrelationId],
      foreignColumns: [didcommConnection.id, didcommConnection.contextCorrelationId],
    }).onDelete('cascade'),
  ]
)
