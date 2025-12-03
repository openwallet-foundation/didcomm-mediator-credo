import { beforeEach, describe, expect, it, vi } from 'vitest'
import config from '../../../../config'
import { firebaseApps } from '../../firebase'
import { sendFcmPushNotification } from '../PushNotificationEvent'

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

  const agentContext = {} as any

  beforeEach(() => {
    vi.clearAllMocks()

    // Reset firebaseApps map
    firebaseApps.clear()
    firebaseApps.set('proj1', mockFirebaseApp as any)
    firebaseApps.set('proj2', mockFirebaseApp as any)

    // Mock config get
    vi.spyOn(config, 'get').mockImplementation((key?: string) => {
      if (key === 'agent:pushNotificationTitle') return 'Test Title'
      if (key === 'agent:pushNotificationBody') return 'Test Body'
      return undefined
    })
  })

  it('does nothing if title or body missing', async () => {
    vi.spyOn(config, 'get').mockReturnValueOnce(null).mockReturnValueOnce(null)

    await sendFcmPushNotification(
      agentContext,
      mockRepository as any,
      {
        deviceToken: 'abc',
        firebaseProjectId: null,
      } as any,
      mockLogger as any
    )

    expect(mockLogger.warn).toHaveBeenCalledWith('Push notification title or body is missing in configuration')
    expect(mockMessagingSend).not.toHaveBeenCalled()
  })

  it('logs and returns if device token is null', async () => {
    await sendFcmPushNotification(agentContext, mockRepository as any, { deviceToken: null } as any, mockLogger as any)

    expect(mockLogger.warn).toHaveBeenCalledWith('Device token is null, cannot send push notification')
  })

  it('logs warning if projectId is specified but no app exists', async () => {
    firebaseApps.clear() // no apps

    await sendFcmPushNotification(
      agentContext,
      mockRepository as any,
      {
        deviceToken: 'abc',
        firebaseProjectId: 'missing-project',
      } as any,
      mockLogger as any
    )

    expect(mockLogger.warn).toHaveBeenCalledWith('No Firebase app found for projectId: missing-project')
  })

  it('sends push notification successfully and updates repository', async () => {
    mockMessagingSend.mockResolvedValueOnce('mock-response')

    const record = {
      deviceToken: 'abc',
      firebaseProjectId: 'proj1',
    } as any

    const result = await sendFcmPushNotification(agentContext, mockRepository as any, record, mockLogger as any)

    expect(mockMessagingSend).toHaveBeenCalled()
    expect(mockLogger.info).toHaveBeenCalled()
    expect(mockRepository.update).toHaveBeenCalled()
    expect(result).toBe('mock-response')
    expect(record.firebaseProjectId).toBe('proj1')
  })

  it('tries multiple apps if the first one throws', async () => {
    // First attempt fails
    mockMessagingSend
      .mockRejectedValueOnce(new Error('fail')) // proj1
      .mockResolvedValueOnce('ok') // proj2

    const record = {
      deviceToken: 'abc',
      firebaseProjectId: undefined,
    } as any

    const result = await sendFcmPushNotification(agentContext, mockRepository as any, record, mockLogger as any)

    expect(mockMessagingSend).toHaveBeenCalledTimes(2)
    expect(result).toBe('ok')
    expect(mockRepository.update).toHaveBeenCalled()
  })
})
