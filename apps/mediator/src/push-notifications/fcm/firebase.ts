import admin from 'firebase-admin'
import config from '../../config'

export const firebase: admin.app.App | undefined = !config.get('agent:usePushNotifications')
  ? undefined
  : admin.apps.length
    ? admin.app()
    : admin.initializeApp({
        credential: admin.credential.cert({
          projectId: config.get('agent:firebase:projectId'),
          clientEmail: config.get('agent:firebase:clientEmail'),
          privateKey: config.get('agent:firebase:privateKey')?.replace(/\\n/g, '\n'),
        }),
      })
