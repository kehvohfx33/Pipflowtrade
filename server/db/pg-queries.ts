/**
 * PostgreSQL Query Definitions with Explicit Parameter Type Casts
 * --------------------------------------------------------------------------
 * Prevents PostgreSQL error 42P18 ("could not determine data type of parameter $3")
 * by explicitly typing every bound parameter ($1::uuid, $2::text, $3::text, etc.).
 * Used in Render production when DATABASE_URL is connected to Managed PostgreSQL.
 */

export const PG_STATEMENTS = {
  upsertConnectedDerivAccount: `
    INSERT INTO connected_deriv_accounts (
      id, user_id, deriv_login_id, account_type, currency, reported_balance,
      landing_company, is_active, connection_status, last_synced_at, updated_at
    ) VALUES (
      $1::uuid, $2::uuid, $3::text, $4::text, $5::text, $6::numeric(18,8),
      NULLIF($7::text, ''), $8::boolean, 'CONNECTED', NOW(), NOW()
    )
    ON CONFLICT (user_id, deriv_login_id)
    DO UPDATE SET
      account_type = EXCLUDED.account_type,
      currency = EXCLUDED.currency,
      reported_balance = EXCLUDED.reported_balance,
      landing_company = COALESCE(EXCLUDED.landing_company, connected_deriv_accounts.landing_company),
      is_active = EXCLUDED.is_active,
      connection_status = 'CONNECTED',
      last_synced_at = NOW(),
      updated_at = NOW()
    RETURNING *;
  `,

  upsertEncryptedDerivToken: `
    INSERT INTO encrypted_deriv_tokens (
      id, deriv_account_id, user_id, ciphertext, iv, auth_tag, scopes, updated_at
    ) VALUES (
      $1::uuid, $2::uuid, $3::uuid, $4::text, $5::text, $6::text, $7::text, NOW()
    )
    ON CONFLICT (deriv_account_id)
    DO UPDATE SET
      ciphertext = EXCLUDED.ciphertext,
      iv = EXCLUDED.iv,
      auth_tag = EXCLUDED.auth_tag,
      scopes = EXCLUDED.scopes,
      updated_at = NOW()
    RETURNING id, deriv_account_id, user_id, scopes, updated_at;
  `,

  insertPlatformLedgerEntry: `
    INSERT INTO platform_ledger_entries (
      id, ledger_account_id, user_id, admin_id, adjustment_request_id,
      entry_type, amount, currency, previous_balance, new_balance, reason, reversed_entry_id
    ) VALUES (
      $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
      $6::text, $7::numeric(18,8), $8::text, $9::numeric(18,8), $10::numeric(18,8), $11::text, $12::uuid
    )
    RETURNING *;
  `,
};
