import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('sendFcmPushNotification', () => {
  const mockMessagingSend = vi.fn()
  const mockFirebaseApp = {
    messaging: () => ({ send: mockMessagingSend }),
  }

  const mockLogger = {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }

  const mockRepository = {
    update: vi.fn(),
  }

  const agentContext = {
    config: {
      logger: mockLogger,
    },
    resolve: () => mockRepository,
  } as any

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does nothing if firebase is not configured', async () => {
    process.env = {
      ASKAR__STORE_ID: 'test',
      ASKAR__STORE_KEY: 'test',
    }

    const { firebaseApps } = await import('../../firebase.js')
    const { sendFcmPushNotification } = await import('../PushNotificationEvent.js')

    // Reset firebaseApps map
    firebaseApps.clear()
    firebaseApps.set('proj1', mockFirebaseApp as any)
    firebaseApps.set('proj2', mockFirebaseApp as any)

    await sendFcmPushNotification(agentContext, {
      deviceToken: 'abc',
      firebaseProjectId: null,
    } as any)

    expect(mockLogger.warn).toHaveBeenCalledWith('Firebase is not initialized. Push notifications are disabled.')
    expect(mockMessagingSend).not.toHaveBeenCalled()
  })

  it('logs and returns if device token is null', async () => {
    process.env = {
      ASKAR__STORE_ID: 'test',
      ASKAR__STORE_KEY: 'test',
    }

    const { sendFcmPushNotification } = await import('../PushNotificationEvent.js')

    await sendFcmPushNotification(agentContext, {
      deviceToken: null,
      connectionId: 'something',
    } as any)

    expect(mockLogger.warn).toHaveBeenCalledWith(
      'No device token found for connection something so skip sending pushing notification'
    )
  })

  it('logs warning if projectId is specified but no app exists', async () => {
    process.env = {
      ASKAR__STORE_ID: 'test',
      ASKAR__STORE_KEY: 'test',
    }

    const { sendFcmPushNotification } = await import('../PushNotificationEvent.js')
    const { config } = await import('../../../../config.js')

    config.pushNotifications.firebase = {
      notificationTitle: '',
      notificationBody: '',
      projects: [{} as any],
    }

    await sendFcmPushNotification(agentContext, {
      deviceToken: 'abc',
      firebaseProjectId: 'missing-project',
    } as any)

    expect(mockLogger.warn).toHaveBeenCalledWith('No Firebase app found for projectId: missing-project')
  })

  it('sends push notification successfully and updates repository if no project id yet', async () => {
    mockMessagingSend.mockResolvedValueOnce('mock-response')

    process.env = {
      ASKAR__STORE_ID: 'test',
      ASKAR__STORE_KEY: 'test',
    }

    const { firebaseApps } = await import('../../firebase.js')
    const { sendFcmPushNotification } = await import('../PushNotificationEvent.js')
    const { config } = await import('../../../../config.js')

    config.pushNotifications.firebase = {
      notificationTitle: '',
      notificationBody: '',
      projects: [{} as any],
    }

    // Reset firebaseApps map
    firebaseApps.clear()
    firebaseApps.set('proj1', mockFirebaseApp as any)
    firebaseApps.set('proj2', mockFirebaseApp as any)

    const record = {
      deviceToken: 'abc',
    } as any

    const result = await sendFcmPushNotification(agentContext, record)

    expect(mockMessagingSend).toHaveBeenCalled()
    expect(mockLogger.info).toHaveBeenCalled()
    expect(mockRepository.update).toHaveBeenCalled()
    expect(result).toBe('mock-response')
    expect(record.firebaseProjectId).toBe('proj1')
  })

  it('tries multiple apps if the first one throws', async () => {
    process.env = {
      ASKAR__STORE_ID: 'test',
      ASKAR__STORE_KEY: 'test',
    }

    const { firebaseApps } = await import('../../firebase.js')
    const { sendFcmPushNotification } = await import('../PushNotificationEvent.js')
    const { config } = await import('../../../../config.js')

    config.pushNotifications.firebase = {
      notificationTitle: '',
      notificationBody: '',
      projects: [{} as any],
    }

    // Reset firebaseApps map
    firebaseApps.clear()
    firebaseApps.set('proj1', mockFirebaseApp as any)
    firebaseApps.set('proj2', mockFirebaseApp as any)

    // First attempt fails
    mockMessagingSend
      .mockRejectedValueOnce(new Error('fail')) // proj1
      .mockResolvedValueOnce('ok') // proj2

    const record = {
      deviceToken: 'abc',
      firebaseProjectId: undefined,
    } as any

    const result = await sendFcmPushNotification(agentContext, record)

    expect(mockMessagingSend).toHaveBeenCalledTimes(2)
    expect(result).toBe('ok')
    expect(mockRepository.update).toHaveBeenCalled()
  })
})
