export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      users_profile: {
        Row: {
          id: string;
          email: string;
          timezone: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          timezone?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          timezone?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      submissions: {
        Row: {
          id: string;
          user_id: string;
          source_type: string;
          original_text: string;
          language: string;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          source_type: string;
          original_text: string;
          language?: string;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          source_type?: string;
          original_text?: string;
          language?: string;
          status?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      analyses: {
        Row: {
          id: string;
          submission_id: string;
          user_id: string;
          model: string;
          corrected_text: string;
          summary: string | null;
          schema_version: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          submission_id: string;
          user_id: string;
          model: string;
          corrected_text: string;
          summary?: string | null;
          schema_version: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          submission_id?: string;
          user_id?: string;
          model?: string;
          corrected_text?: string;
          summary?: string | null;
          schema_version?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      analysis_issues: {
        Row: {
          id: string;
          analysis_id: string;
          submission_id: string;
          user_id: string;
          error_text: string;
          corrected_text: string;
          category: string;
          subcategory: string | null;
          explanation_short: string;
          confidence: number;
          severity: number;
          teachability: number;
          should_create_card: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          analysis_id: string;
          submission_id: string;
          user_id: string;
          error_text: string;
          corrected_text: string;
          category: string;
          subcategory?: string | null;
          explanation_short: string;
          confidence: number;
          severity: number;
          teachability: number;
          should_create_card?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          analysis_id?: string;
          submission_id?: string;
          user_id?: string;
          error_text?: string;
          corrected_text?: string;
          category?: string;
          subcategory?: string | null;
          explanation_short?: string;
          confidence?: number;
          severity?: number;
          teachability?: number;
          should_create_card?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      learning_targets: {
        Row: {
          id: string;
          user_id: string;
          canonical_key: string;
          display_title: string;
          category: string;
          subcategory: string | null;
          explanation_short: string;
          first_seen_at: string;
          last_seen_at: string;
          seen_count: number;
          active_card_count: number;
          mastery_score: number;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          canonical_key: string;
          display_title: string;
          category: string;
          subcategory?: string | null;
          explanation_short: string;
          first_seen_at?: string;
          last_seen_at?: string;
          seen_count?: number;
          active_card_count?: number;
          mastery_score?: number;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          canonical_key?: string;
          display_title?: string;
          category?: string;
          subcategory?: string | null;
          explanation_short?: string;
          first_seen_at?: string;
          last_seen_at?: string;
          seen_count?: number;
          active_card_count?: number;
          mastery_score?: number;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      learning_target_evidence: {
        Row: {
          id: string;
          learning_target_id: string;
          analysis_issue_id: string;
          submission_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          learning_target_id: string;
          analysis_issue_id: string;
          submission_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          learning_target_id?: string;
          analysis_issue_id?: string;
          submission_id?: string;
          user_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      cards: {
        Row: {
          id: string;
          user_id: string;
          learning_target_id: string;
          source_submission_id: string | null;
          card_type: string;
          front: string;
          back: string;
          hint: string | null;
          example: string | null;
          status: string;
          priority: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          learning_target_id: string;
          source_submission_id?: string | null;
          card_type: string;
          front: string;
          back: string;
          hint?: string | null;
          example?: string | null;
          status?: string;
          priority?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          learning_target_id?: string;
          source_submission_id?: string | null;
          card_type?: string;
          front?: string;
          back?: string;
          hint?: string | null;
          example?: string | null;
          status?: string;
          priority?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      srs_state: {
        Row: {
          card_id: string;
          user_id: string;
          repetition: number;
          interval_days: number;
          ease_factor: number;
          due_at: string;
          last_reviewed_at: string | null;
          lapse_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          card_id: string;
          user_id: string;
          repetition?: number;
          interval_days?: number;
          ease_factor?: number;
          due_at?: string;
          last_reviewed_at?: string | null;
          lapse_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          card_id?: string;
          user_id?: string;
          repetition?: number;
          interval_days?: number;
          ease_factor?: number;
          due_at?: string;
          last_reviewed_at?: string | null;
          lapse_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      reviews: {
        Row: {
          id: string;
          card_id: string;
          user_id: string;
          rating: number;
          response_ms: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          card_id: string;
          user_id: string;
          rating: number;
          response_ms?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          card_id?: string;
          user_id?: string;
          rating?: number;
          response_ms?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      card_feedback: {
        Row: {
          id: string;
          card_id: string;
          user_id: string;
          type: string;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          card_id: string;
          user_id: string;
          type: string;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          card_id?: string;
          user_id?: string;
          type?: string;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      jobs: {
        Row: {
          id: string;
          type: string;
          payload: Json;
          status: string;
          attempts: number;
          available_at: string;
          created_at: string;
          updated_at: string;
          last_error: string | null;
        };
        Insert: {
          id?: string;
          type: string;
          payload: Json;
          status?: string;
          attempts?: number;
          available_at?: string;
          created_at?: string;
          updated_at?: string;
          last_error?: string | null;
        };
        Update: {
          id?: string;
          type?: string;
          payload?: Json;
          status?: string;
          attempts?: number;
          available_at?: string;
          created_at?: string;
          updated_at?: string;
          last_error?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
