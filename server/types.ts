export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'LOCKED';
export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'SUPPORT' | 'USER';
export type AppId = 'bot' | 'trader' | 'charts' | 'options';
export type TradingMode = 'DEMO' | 'REAL';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  status: UserStatus;
  emailVerified: boolean;
  emailVerificationTokenHash: string | null;
  passwordResetTokenHash: string | null;
  passwordResetExpiresAt: string | null;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  onboardingCompleted: boolean;
  onboardingStep: number;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfileRecord {
  id: string;
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  country: string | null;
  timezone: string;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserRoleRecord {
  id: string;
  userId: string;
  role: UserRole;
  assignedBy: string | null;
  createdAt: string;
}

export interface UserPermissionRecord {
  id: string;
  userId: string;
  permission: string;
  grantedBy: string | null;
  createdAt: string;
}

export interface UserSessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  ipAddress: string | null;
  userAgent: string | null;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface AdministratorAccountRecord {
  id: string;
  userId: string | null;
  email: string;
  passwordHash: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'SUPPORT';
  mfaEnabled: boolean;
  mfaSecretEncrypted: { ciphertext: string; iv: string; authTag: string } | null;
  status: 'ACTIVE' | 'SUSPENDED';
  lastAuthenticatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdministratorSessionRecord {
  id: string;
  adminId: string;
  tokenHash: string;
  mfaVerified: boolean;
  ipAddress: string | null;
  userAgent: string | null;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface ConnectedDerivAccountRecord {
  id: string;
  userId: string;
  derivLoginId: string;
  accountType: TradingMode;
  currency: string;
  reportedBalance: string; // Decimal-safe numeric string
  landingCompany: string | null;
  isActive: boolean;
  connectionStatus: 'CONNECTED' | 'DISCONNECTED' | 'EXPIRED';
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EncryptedDerivTokenRecord {
  id: string;
  derivAccountId: string;
  userId: string;
  ciphertext: string;
  iv: string;
  authTag: string;
  scopes: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccountPreferencesRecord {
  id: string;
  userId: string;
  emailNotifications: boolean;
  tradeAlerts: boolean;
  riskAlerts: boolean;
  compactTerminal: boolean;
  updatedAt: string;
}

export interface TradingPreferencesRecord {
  id: string;
  userId: string;
  defaultApplication: AppId;
  preferredMode: TradingMode;
  defaultMarket: string;
  realMoneyRiskAcknowledged: boolean;
  riskAcknowledgedAt: string | null;
  updatedAt: string;
}

export interface RiskSettingsRecord {
  id: string;
  userId: string;
  maxStake: string;
  maxDailyLoss: string;
  maxTradesPerDay: number;
  stopLossLimit: string;
  takeProfitTarget: string;
  maxConsecutiveLosses: number;
  maxExposure: string;
  sessionTimeLimitMinutes: number;
  emergencyStopActive: boolean;
  updatedAt: string;
}

export interface ApplicationRegistryRecord {
  id: AppId;
  name: string;
  description: string;
  productionUrl: string;
  hostingProvider: string;
  version: string;
  ssoEnabled: boolean;
  iframeCompatible: boolean;
  healthStatus: 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'UNKNOWN';
  lastError: string | null;
  latencyMs: number | null;
  lastHealthCheckAt: string | null;
  updatedAt: string;
}

export interface ApplicationSessionRecord {
  id: string;
  userId: string;
  appId: AppId;
  ssoCodeHash: string;
  derivAccountId: string | null;
  expiresAt: string;
  exchangedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface PlatformLedgerAccountRecord {
  id: string;
  userId: string;
  currency: string;
  status: 'ACTIVE' | 'FROZEN';
  createdAt: string;
}

export interface PlatformLedgerBalanceRecord {
  ledgerAccountId: string;
  availableBalance: string;
  updatedAt: string;
}

export interface BalanceAdjustmentRequestRecord {
  id: string;
  userId: string;
  ledgerAccountId: string;
  requestedByAdminId: string;
  entryType: 'CREDIT' | 'DEBIT' | 'REVERSAL';
  amount: string;
  currency: string;
  reason: string;
  referenceEntryId: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
}

export interface BalanceApprovalRecord {
  id: string;
  adjustmentRequestId: string;
  approvedByAdminId: string;
  decision: 'APPROVED' | 'REJECTED';
  notes: string | null;
  createdAt: string;
}

export interface PlatformLedgerEntryRecord {
  id: string;
  ledgerAccountId: string;
  userId: string;
  adminId: string;
  adminEmail: string;
  adjustmentRequestId: string | null;
  entryType: 'CREDIT' | 'DEBIT' | 'REVERSAL';
  amount: string;
  currency: string;
  previousBalance: string;
  newBalance: string;
  reason: string;
  reversedEntryId: string | null;
  createdAt: string;
}

export interface NotificationRecord {
  id: string;
  userId: string;
  category: 'CONNECTION' | 'TRADE' | 'SETTLEMENT' | 'RISK' | 'SECURITY' | 'LEDGER' | 'ANNOUNCEMENT';
  title: string;
  message: string;
  isRead: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface TradeRecord {
  id: string;
  userId: string;
  derivAccountId: string | null;
  appId: AppId;
  derivContractId: string | null;
  symbol: string;
  contractType: string;
  stake: string;
  payout: string | null;
  profit: string | null;
  currency: string;
  mode: TradingMode;
  status: 'OPEN' | 'WON' | 'LOST' | 'SOLD' | 'ERROR';
  openedAt: string;
  settledAt: string | null;
}

export interface TradingHistoryRecord {
  id: string;
  tradeId: string | null;
  userId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface TransactionRecord {
  id: string;
  userId: string;
  source: 'DERIV' | 'PLATFORM_LEDGER';
  referenceId: string | null;
  actionType: string;
  amount: string;
  currency: string;
  balanceAfter: string | null;
  description: string;
  createdAt: string;
}

export interface AdminAuditLogRecord {
  id: string;
  adminId: string | null;
  adminEmail: string;
  action: string;
  targetType: string;
  targetId: string | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
}

export interface SupportTicketRecord {
  id: string;
  userId: string | null;
  email: string;
  subject: string;
  category: string;
  message: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  createdAt: string;
  updatedAt: string;
}

export interface SystemSettingRecord {
  key: string;
  value: Record<string, unknown>;
  updatedAt: string;
}

export interface OAuthStateRecord {
  state: string;
  userId: string | null;
  intent: 'LOGIN' | 'CONNECT';
  createdAt: string;
  expiresAt: string;
}

export interface DatabaseSnapshot {
  users: UserRecord[];
  user_profiles: UserProfileRecord[];
  user_roles: UserRoleRecord[];
  user_permissions: UserPermissionRecord[];
  user_sessions: UserSessionRecord[];
  administrator_accounts: AdministratorAccountRecord[];
  administrator_sessions: AdministratorSessionRecord[];
  connected_deriv_accounts: ConnectedDerivAccountRecord[];
  encrypted_deriv_tokens: EncryptedDerivTokenRecord[];
  account_preferences: AccountPreferencesRecord[];
  trading_preferences: TradingPreferencesRecord[];
  risk_settings: RiskSettingsRecord[];
  application_registry: ApplicationRegistryRecord[];
  application_sessions: ApplicationSessionRecord[];
  platform_ledger_accounts: PlatformLedgerAccountRecord[];
  platform_ledger_balances: PlatformLedgerBalanceRecord[];
  balance_adjustment_requests: BalanceAdjustmentRequestRecord[];
  balance_approvals: BalanceApprovalRecord[];
  platform_ledger_entries: PlatformLedgerEntryRecord[];
  notifications: NotificationRecord[];
  trades: TradeRecord[];
  trading_history: TradingHistoryRecord[];
  transactions: TransactionRecord[];
  admin_audit_logs: AdminAuditLogRecord[];
  support_tickets: SupportTicketRecord[];
  system_settings: SystemSettingRecord[];
  oauth_states: OAuthStateRecord[];
}
