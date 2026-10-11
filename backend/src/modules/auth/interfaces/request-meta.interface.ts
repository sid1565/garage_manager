/** Client details captured for sessions and audit rows. */
export interface IRequestMeta {
  ip: string | null;
  userAgent: string | null;
}

export interface IIssuedTokens {
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
}
