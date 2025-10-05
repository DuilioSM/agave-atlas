-- Schema for AuthJS with Supabase
-- Run this SQL in your Supabase SQL Editor

-- Create accounts table
CREATE TABLE IF NOT EXISTS accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  type VARCHAR(255) NOT NULL,
  provider VARCHAR(255) NOT NULL,
  provider_account_id VARCHAR(255) NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at BIGINT,
  token_type VARCHAR(255),
  scope VARCHAR(255),
  id_token TEXT,
  session_state VARCHAR(255),
  user_id UUID NOT NULL,
  PRIMARY KEY (id)
);

-- Create sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  session_token VARCHAR(255) NOT NULL,
  PRIMARY KEY (id)
);

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  name VARCHAR(255),
  email VARCHAR(255),
  email_verified TIMESTAMPTZ,
  image TEXT,
  PRIMARY KEY (id)
);

-- Create verification_tokens table
CREATE TABLE IF NOT EXISTS verification_tokens (
  identifier TEXT NOT NULL,
  token TEXT NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (identifier, token)
);

-- Add foreign key constraints
ALTER TABLE accounts ADD CONSTRAINT accounts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE sessions ADD CONSTRAINT sessions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS accounts_user_id_idx ON accounts(user_id);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS sessions_session_token_idx ON sessions(session_token);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users(email);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_provider_provider_account_id_key ON accounts(provider, provider_account_id);
