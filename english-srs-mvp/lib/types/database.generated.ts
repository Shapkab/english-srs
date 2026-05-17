export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      analyses: {
        Row: {
          corrected_text: string
          created_at: string
          id: string
          model: string
          schema_version: string
          submission_id: string
          summary: string | null
          user_id: string
        }
        Insert: {
          corrected_text: string
          created_at?: string
          id?: string
          model: string
          schema_version: string
          submission_id: string
          summary?: string | null
          user_id: string
        }
        Update: {
          corrected_text?: string
          created_at?: string
          id?: string
          model?: string
          schema_version?: string
          submission_id?: string
          summary?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analyses_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analyses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_issues: {
        Row: {
          analysis_id: string
          category: string
          confidence: number
          corrected_text: string
          created_at: string
          error_text: string
          explanation_short: string
          id: string
          severity: number
          should_create_card: boolean
          subcategory: string | null
          submission_id: string
          teachability: number
          user_id: string
        }
        Insert: {
          analysis_id: string
          category: string
          confidence: number
          corrected_text: string
          created_at?: string
          error_text: string
          explanation_short: string
          id?: string
          severity: number
          should_create_card?: boolean
          subcategory?: string | null
          submission_id: string
          teachability: number
          user_id: string
        }
        Update: {
          analysis_id?: string
          category?: string
          confidence?: number
          corrected_text?: string
          created_at?: string
          error_text?: string
          explanation_short?: string
          id?: string
          severity?: number
          should_create_card?: boolean
          subcategory?: string | null
          submission_id?: string
          teachability?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_issues_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_issues_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_issues_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
        ]
      }
      card_feedback: {
        Row: {
          card_id: string
          created_at: string
          id: string
          note: string | null
          type: string
          user_id: string
        }
        Insert: {
          card_id: string
          created_at?: string
          id?: string
          note?: string | null
          type: string
          user_id: string
        }
        Update: {
          card_id?: string
          created_at?: string
          id?: string
          note?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_feedback_card_id_user_id_fkey"
            columns: ["card_id", "user_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "card_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
        ]
      }
      cards: {
        Row: {
          back: string
          card_type: string
          created_at: string
          example: string | null
          front: string
          hint: string | null
          id: string
          learning_target_id: string
          priority: number
          source_submission_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          back: string
          card_type: string
          created_at?: string
          example?: string | null
          front: string
          hint?: string | null
          id?: string
          learning_target_id: string
          priority?: number
          source_submission_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          back?: string
          card_type?: string
          created_at?: string
          example?: string | null
          front?: string
          hint?: string | null
          id?: string
          learning_target_id?: string
          priority?: number
          source_submission_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cards_learning_target_id_user_id_fkey"
            columns: ["learning_target_id", "user_id"]
            isOneToOne: false
            referencedRelation: "learning_targets"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "cards_source_submission_id_fkey"
            columns: ["source_submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          attempts: number
          available_at: string
          claimed_at: string | null
          created_at: string
          id: string
          last_error: string | null
          max_attempts: number
          payload: Json
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          claimed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          payload: Json
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          available_at?: string
          claimed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          payload?: Json
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      learning_target_evidence: {
        Row: {
          analysis_issue_id: string
          created_at: string
          id: string
          learning_target_id: string
          submission_id: string
          user_id: string
        }
        Insert: {
          analysis_issue_id: string
          created_at?: string
          id?: string
          learning_target_id: string
          submission_id: string
          user_id: string
        }
        Update: {
          analysis_issue_id?: string
          created_at?: string
          id?: string
          learning_target_id?: string
          submission_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_target_evidence_analysis_issue_id_fkey"
            columns: ["analysis_issue_id"]
            isOneToOne: false
            referencedRelation: "analysis_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_target_evidence_learning_target_id_fkey"
            columns: ["learning_target_id"]
            isOneToOne: false
            referencedRelation: "learning_targets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_target_evidence_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_target_evidence_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_targets: {
        Row: {
          canonical_key: string
          category: string
          created_at: string
          display_title: string
          explanation_short: string
          first_seen_at: string
          id: string
          last_seen_at: string
          merged_into_id: string | null
          seen_count: number
          status: string
          subcategory: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          canonical_key: string
          category: string
          created_at?: string
          display_title: string
          explanation_short: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          merged_into_id?: string | null
          seen_count?: number
          status?: string
          subcategory?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          canonical_key?: string
          category?: string
          created_at?: string
          display_title?: string
          explanation_short?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          merged_into_id?: string | null
          seen_count?: number
          status?: string
          subcategory?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_targets_merged_into_id_user_id_fkey"
            columns: ["merged_into_id", "user_id"]
            isOneToOne: false
            referencedRelation: "learning_targets"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "learning_targets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          bucket: string
          count: number
          user_id: string
          window_started_at: string
        }
        Insert: {
          bucket: string
          count?: number
          user_id: string
          window_started_at?: string
        }
        Update: {
          bucket?: string
          count?: number
          user_id?: string
          window_started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_limits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          card_id: string
          created_at: string
          id: string
          rating: number
          response_ms: number | null
          user_id: string
        }
        Insert: {
          card_id: string
          created_at?: string
          id?: string
          rating: number
          response_ms?: number | null
          user_id: string
        }
        Update: {
          card_id?: string
          created_at?: string
          id?: string
          rating?: number
          response_ms?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
        ]
      }
      srs_state: {
        Row: {
          card_id: string
          created_at: string
          due_at: string
          ease_factor: number
          interval_days: number
          lapse_count: number
          last_reviewed_at: string | null
          repetition: number
          updated_at: string
          user_id: string
        }
        Insert: {
          card_id: string
          created_at?: string
          due_at?: string
          ease_factor?: number
          interval_days?: number
          lapse_count?: number
          last_reviewed_at?: string | null
          repetition?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          card_id?: string
          created_at?: string
          due_at?: string
          ease_factor?: number
          interval_days?: number
          lapse_count?: number
          last_reviewed_at?: string | null
          repetition?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "srs_state_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: true
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "srs_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          created_at: string
          failure_reason: string | null
          id: string
          language: string
          original_text: string
          source_type: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          failure_reason?: string | null
          id?: string
          language?: string
          original_text: string
          source_type: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          failure_reason?: string | null
          id?: string
          language?: string
          original_text?: string
          source_type?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
        ]
      }
      users_profile: {
        Row: {
          created_at: string
          email: string
          id: string
          timezone: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          timezone?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          timezone?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_and_consume_rate_limit: {
        Args: {
          p_bucket: string
          p_max: number
          p_user_id: string
          p_window_seconds: number
        }
        Returns: {
          allowed: boolean
          remaining: number
          reset_at: string
        }[]
      }
      mark_submission_failed: {
        Args: { p_reason: string; p_submission_id: string; p_user_id: string }
        Returns: undefined
      }
      merge_learning_targets: {
        Args: { p_from_id: string; p_into_id: string; p_user_id: string }
        Returns: undefined
      }
      persist_submission_analysis: {
        Args: {
          p_card_candidates: Json
          p_corrected_text: string
          p_issues: Json
          p_model: string
          p_normalized_targets: Json
          p_schema_version: string
          p_submission_id: string
          p_summary: string
          p_user_id: string
        }
        Returns: {
          analysis_id: string
          created_card_ids: string[]
          inserted_issue_ids: string[]
        }[]
      }
      record_review: {
        Args: {
          p_card_id: string
          p_rating: number
          p_response_ms: number
          p_user_id: string
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

