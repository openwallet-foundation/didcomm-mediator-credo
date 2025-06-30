import admin from 'firebase-admin'
import { config } from '../../config'

export const firebase: admin.app.App | undefined = !config.pushNotifications?.firebase
  ? undefined
  : admin.apps.length
    ? admin.app()
    : admin.initializeApp({
        credential: admin.credential.cert({
          projectId: config.pushNotifications.firebase.projectId,
          clientEmail: config.pushNotifications.firebase.clientEmail,
          privateKey: config.pushNotifications.firebase.privateKey,
        }),
      })
