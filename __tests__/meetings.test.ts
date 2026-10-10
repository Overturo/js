// The participant's own meeting pair (status / withdrawal): decodes the
// recorded exchanges the real API produced, sends the session token the way
// the server reads it, and refuses blank ids before the network.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Overturo } from "../src"
import { OverturoValidationError } from "../src/errors"
import { corpusBody } from "./support/corpus"

const API_BASE_URL = "https://api.test.local"
const MEETING = "vnsess_test_1"
const TOKEN = "sess_test_token"

function makeClient(): Overturo {
  return new Overturo({ publishableKey: "pk_test_x", baseUrl: API_BASE_URL, flowBaseUrl: API_BASE_URL })
}

describe("meeting participant pair (200)", () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn(async (url: string) => {
      const operation = String(url).includes("/revoke") ? "MeetingConsents_revoke" : "MeetingConsents_status"
      return new Response(JSON.stringify(corpusBody(operation)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("reads this participant's status with the meeting it is pinned to", async () => {
    const status = await makeClient().getMeetingParticipantStatus(MEETING, TOKEN)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${API_BASE_URL}/api/v1/meeting_consents/${MEETING}/status?session_token=${TOKEN}`)
    expect((init.headers as Record<string, string>)["X-Publishable-Key"]).toBe("pk_test_x")
    expect(status.status).toBe("fulfilled")
    expect(status.purposes).toMatchObject({ meeting_recording: "true", ai_transcription: "false" })
    expect(status.meeting?.platform).toBe("zoom")
    expect(status.meeting?.id).toBe(status.meetingConsentId)
    expect(status.consentedAt).toBeTypeOf("string")
  })

  it("withdraws with the session token in the body, snake_case on the wire", async () => {
    const result = await makeClient().withdrawMeetingConsent(MEETING, TOKEN)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${API_BASE_URL}/api/v1/meeting_consents/${MEETING}/revoke`)
    expect(init.method).toBe("POST")
    expect(JSON.parse(String(init.body))).toEqual({ session_token: TOKEN })
    expect(result.status).toBe("revoked")
    expect(result.revokedAt).toBeTypeOf("string")
  })

  it("refuses blank ids before the network", async () => {
    const client = makeClient()
    await expect(client.getMeetingParticipantStatus("", TOKEN)).rejects.toBeInstanceOf(OverturoValidationError)
    await expect(client.withdrawMeetingConsent(MEETING, "")).rejects.toBeInstanceOf(OverturoValidationError)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
