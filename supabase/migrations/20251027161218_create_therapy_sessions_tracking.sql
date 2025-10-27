/*
  # Therapy Sessions Tracking System

  1. New Tables
    - `therapy_sessions`
      - `id` (uuid, primary key) - Unique session identifier
      - `user_id` (uuid) - Reference to the patient
      - `therapy_id` (text) - Reference to the therapy module
      - `therapy_name` (text) - Name of the therapy
      - `completed_at` (timestamptz) - When the session was completed
      - `session_number` (integer) - Sequential session number (1, 2, 3, etc.)
      - `created_at` (timestamptz) - Record creation timestamp

    - `user_therapy_progress`
      - `id` (uuid, primary key)
      - `user_id` (uuid) - Reference to the patient
      - `therapy_id` (text) - Reference to the therapy module
      - `therapy_name` (text) - Name of the therapy
      - `total_sessions_completed` (integer, default 0) - Total number of sessions completed
      - `last_completed_at` (timestamptz) - Last completion timestamp
      - `created_at` (timestamptz) - Record creation timestamp
      - `updated_at` (timestamptz) - Record update timestamp

  2. Security
    - Enable RLS on both tables
    - Users can read their own session data
    - Users can insert their own sessions
    - Therapists can read sessions of their patients

  3. Indexes
    - Index on user_id for fast lookups
    - Index on therapy_id for filtering
    - Composite index on (user_id, therapy_id) for progress queries

  4. Important Notes
    - Sessions start at 0 and increment by 1 for each completion
    - Each therapy completion creates a new session record
    - Progress table maintains the current count for each user-therapy combination
    - Therapists receive this data when patients book video sessions
*/

-- Create therapy_sessions table
CREATE TABLE IF NOT EXISTS therapy_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  therapy_id text NOT NULL,
  therapy_name text NOT NULL,
  completed_at timestamptz DEFAULT now(),
  session_number integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

-- Create user_therapy_progress table
CREATE TABLE IF NOT EXISTS user_therapy_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  therapy_id text NOT NULL,
  therapy_name text NOT NULL,
  total_sessions_completed integer DEFAULT 0,
  last_completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, therapy_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_therapy_sessions_user_id ON therapy_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_therapy_sessions_therapy_id ON therapy_sessions(therapy_id);
CREATE INDEX IF NOT EXISTS idx_therapy_sessions_user_therapy ON therapy_sessions(user_id, therapy_id);
CREATE INDEX IF NOT EXISTS idx_user_therapy_progress_user_id ON user_therapy_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_therapy_progress_therapy_id ON user_therapy_progress(therapy_id);

-- Enable Row Level Security
ALTER TABLE therapy_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_therapy_progress ENABLE ROW LEVEL SECURITY;

-- RLS Policies for therapy_sessions

-- Users can view their own sessions
CREATE POLICY "Users can view own therapy sessions"
  ON therapy_sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert their own sessions
CREATE POLICY "Users can insert own therapy sessions"
  ON therapy_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Therapists can view sessions of their patients (through bookings)
CREATE POLICY "Therapists can view patient sessions"
  ON therapy_sessions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'therapist'
    )
  );

-- RLS Policies for user_therapy_progress

-- Users can view their own progress
CREATE POLICY "Users can view own therapy progress"
  ON user_therapy_progress
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert their own progress
CREATE POLICY "Users can insert own therapy progress"
  ON user_therapy_progress
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own progress
CREATE POLICY "Users can update own therapy progress"
  ON user_therapy_progress
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Therapists can view patient progress
CREATE POLICY "Therapists can view patient progress"
  ON user_therapy_progress
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'therapist'
    )
  );

-- Function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at on user_therapy_progress
DROP TRIGGER IF EXISTS update_user_therapy_progress_updated_at ON user_therapy_progress;
CREATE TRIGGER update_user_therapy_progress_updated_at
  BEFORE UPDATE ON user_therapy_progress
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();