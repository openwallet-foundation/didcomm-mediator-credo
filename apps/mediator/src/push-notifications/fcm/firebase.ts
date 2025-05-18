import admin from 'firebase-admin'
import config from '../../config'

let _firebase: admin.app.App | undefined = undefined
export const getFirebase = () => {
  if (_firebase) return _firebase

  if (admin.apps.length) {
    _firebase = admin.app()
    return _firebase
  }

  if (config.get('agent:firebase:projectId')) {
    _firebase = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.get('agent:firebase:projectId'),
        clientEmail: config.get('agent:firebase:clientEmail'),
        privateKey: config.get('agent:firebase:privateKey'),
      }),
    })
    return _firebase
  }

  throw new Error('Firebase not configured.')
}
