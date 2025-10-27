import { supabase } from '../lib/supabase';

export interface TherapySession {
  id: string;
  user_id: string;
  therapy_id: string;
  therapy_name: string;
  completed_at: string;
  session_number: number;
  created_at: string;
}

export interface UserTherapyProgress {
  id: string;
  user_id: string;
  therapy_id: string;
  therapy_name: string;
  total_sessions_completed: number;
  last_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const recordTherapyCompletion = async (
  userId: string,
  therapyId: string,
  therapyName: string
): Promise<{ success: boolean; sessionNumber: number; error?: string }> => {
  try {
    // Get or create progress record
    const { data: progressData, error: progressError } = await supabase
      .from('user_therapy_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('therapy_id', therapyId)
      .maybeSingle();

    if (progressError && progressError.code !== 'PGRST116') {
      throw progressError;
    }

    let currentProgress = progressData;
    let nextSessionNumber = 1;

    if (currentProgress) {
      // Update existing progress
      nextSessionNumber = currentProgress.total_sessions_completed + 1;

      const { error: updateError } = await supabase
        .from('user_therapy_progress')
        .update({
          total_sessions_completed: nextSessionNumber,
          last_completed_at: new Date().toISOString(),
        })
        .eq('id', currentProgress.id);

      if (updateError) throw updateError;
    } else {
      // Create new progress record
      nextSessionNumber = 1;

      const { error: insertError } = await supabase
        .from('user_therapy_progress')
        .insert({
          user_id: userId,
          therapy_id: therapyId,
          therapy_name: therapyName,
          total_sessions_completed: 1,
          last_completed_at: new Date().toISOString(),
        });

      if (insertError) throw insertError;
    }

    // Record the individual session
    const { error: sessionError } = await supabase
      .from('therapy_sessions')
      .insert({
        user_id: userId,
        therapy_id: therapyId,
        therapy_name: therapyName,
        session_number: nextSessionNumber,
        completed_at: new Date().toISOString(),
      });

    if (sessionError) throw sessionError;

    return {
      success: true,
      sessionNumber: nextSessionNumber,
    };
  } catch (error: any) {
    console.error('Error recording therapy completion:', error);
    return {
      success: false,
      sessionNumber: 0,
      error: error.message,
    };
  }
};

export const getUserTherapyProgress = async (
  userId: string,
  therapyId?: string
): Promise<UserTherapyProgress[]> => {
  try {
    let query = supabase
      .from('user_therapy_progress')
      .select('*')
      .eq('user_id', userId);

    if (therapyId) {
      query = query.eq('therapy_id', therapyId);
    }

    const { data, error } = await query.order('updated_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching user therapy progress:', error);
    return [];
  }
};

export const getTherapySessionHistory = async (
  userId: string,
  therapyId?: string
): Promise<TherapySession[]> => {
  try {
    let query = supabase
      .from('therapy_sessions')
      .select('*')
      .eq('user_id', userId);

    if (therapyId) {
      query = query.eq('therapy_id', therapyId);
    }

    const { data, error } = await query.order('completed_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching therapy session history:', error);
    return [];
  }
};

export const getAllUserProgressSummary = async (userId: string) => {
  try {
    const progress = await getUserTherapyProgress(userId);

    const summary = {
      totalSessions: progress.reduce((sum, p) => sum + p.total_sessions_completed, 0),
      therapiesInProgress: progress.length,
      progressByTherapy: progress.map(p => ({
        therapyId: p.therapy_id,
        therapyName: p.therapy_name,
        sessionsCompleted: p.total_sessions_completed,
        lastCompleted: p.last_completed_at,
      })),
      lastActivity: progress.length > 0
        ? progress.reduce((latest, p) => {
            if (!latest || !p.last_completed_at) return latest;
            return new Date(p.last_completed_at) > new Date(latest)
              ? p.last_completed_at
              : latest;
          }, progress[0].last_completed_at)
        : null,
    };

    return summary;
  } catch (error) {
    console.error('Error fetching user progress summary:', error);
    return {
      totalSessions: 0,
      therapiesInProgress: 0,
      progressByTherapy: [],
      lastActivity: null,
    };
  }
};

export const getPatientProgressForTherapist = async (patientId: string) => {
  try {
    const summary = await getAllUserProgressSummary(patientId);
    const sessions = await getTherapySessionHistory(patientId);

    return {
      patientId,
      summary,
      recentSessions: sessions.slice(0, 10),
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error fetching patient progress for therapist:', error);
    return null;
  }
};

export const resetUserProgress = async (userId: string): Promise<boolean> => {
  try {
    // Note: This deletes all records. Use with caution!
    await supabase.from('therapy_sessions').delete().eq('user_id', userId);
    await supabase.from('user_therapy_progress').delete().eq('user_id', userId);
    return true;
  } catch (error) {
    console.error('Error resetting user progress:', error);
    return false;
  }
};
