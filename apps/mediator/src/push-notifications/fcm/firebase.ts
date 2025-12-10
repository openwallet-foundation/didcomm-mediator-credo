import admin from 'firebase-admin'
import { config } from '../../config.js'

export const firebaseApps: Map<string, admin.app.App> = new Map()
for (const firebaseProject of config.pushNotifications.firebase?.projects ?? []) {
  if (firebaseApps.has(firebaseProject.projectId)) continue

  const app = admin.initializeApp(
    {
      credential: admin.credential.cert({
        projectId: firebaseProject.projectId,
        clientEmail: firebaseProject.clientEmail,
        privateKey: firebaseProject.privateKey?.includes('\\n')
          ? firebaseProject.privateKey.replace(/\\n/g, '\n')
          : firebaseProject.privateKey?.trim(),
      }),
    },
    // Use projectId as the app name
    firebaseProject.projectId
  )

  firebaseApps.set(firebaseProject.projectId, app)
}

export const filterAppsByProjectId = (projectId: string | undefined) => {
  if (!projectId) {
    return firebaseApps
  }

  const app = firebaseApps.get(projectId)
  if (app) {
    return new Map([[projectId, app]])
  }
}

type FirebaseLikeError = {
  code: string
}

export const isFirebaseLikeError = (error: unknown) =>
  error &&
  typeof error === 'object' &&
  error !== null &&
  typeof (error as FirebaseLikeError).code === 'string' &&
  /(app|auth|messaging|storage|firestore|database)\//.test((error as FirebaseLikeError).code)
