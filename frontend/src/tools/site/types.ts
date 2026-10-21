/** Shape of the `/api/inspect` response (see backend/app/inspect_site.py). */

export interface Detection {
  name: string
  kind: string
  confidence: 'high' | 'medium' | 'low'
  evidence: string[]
}

export interface IpInfo {
  ip: string
  asn: number | null
  as_name: string
  country: string
  ptr: string | null
}

export interface Tls {
  verified: boolean | null
  error?: string
  protocol?: string
  cipher?: string
  subject?: string
  issuer?: string
  not_after?: string
  days_left?: number
}

export interface Report {
  target: { url: string; host: string }
  dns: { addresses: string[]; cname_chain: string[]; ns: string[] }
  ips: IpInfo[]
  http: {
    hops: { url: string; ip: string; status: number; http_version: string }[]
    final_status: number | null
    headers: Record<string, string>
    cookie_names: string[]
    server_software: string[]
    security_headers: Record<string, boolean>
  }
  tls: Tls | null
  detections: Detection[]
  notes: string[]
  elapsed_ms: number
  /** present when the answer came from the server's cache */
  cached_age_s?: number
}
