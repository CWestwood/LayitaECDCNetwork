export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      area: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          name?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          actor_reference: string | null
          actor_type: string
          change_reason: string | null
          changed_at: string | null
          changed_by_id: string | null
          changed_fields: Json
          correlation_id: string | null
          id: string
          metadata: Json
          record_id: string
          source: string
          table_name: string
        }
        Insert: {
          actor_reference?: string | null
          actor_type?: string
          change_reason?: string | null
          changed_at?: string | null
          changed_by_id?: string | null
          changed_fields: Json
          correlation_id?: string | null
          id?: string
          metadata?: Json
          record_id: string
          source?: string
          table_name: string
        }
        Update: {
          actor_reference?: string | null
          actor_type?: string
          change_reason?: string | null
          changed_at?: string | null
          changed_by_id?: string | null
          changed_fields?: Json
          correlation_id?: string | null
          id?: string
          metadata?: Json
          record_id?: string
          source?: string
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_changed_by_id_fkey"
            columns: ["changed_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      correction_requests: {
        Row: {
          assigned_to_id: string | null
          created_at: string
          created_by_id: string
          description: string
          id: string
          issue_type: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by_id: string | null
          status: string
          target_id: string | null
          target_table: string
          updated_at: string
        }
        Insert: {
          assigned_to_id?: string | null
          created_at?: string
          created_by_id?: string
          description: string
          id?: string
          issue_type: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by_id?: string | null
          status?: string
          target_id?: string | null
          target_table: string
          updated_at?: string
        }
        Update: {
          assigned_to_id?: string | null
          created_at?: string
          created_by_id?: string
          description?: string
          id?: string
          issue_type?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by_id?: string | null
          status?: string
          target_id?: string | null
          target_table?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "correction_requests_assigned_to_id_fkey"
            columns: ["assigned_to_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "correction_requests_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "correction_requests_resolved_by_id_fkey"
            columns: ["resolved_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ecdc_list: {
        Row: {
          area: string | null
          area_id: string | null
          attendance_updated: string | null
          chief: string | null
          chief_id: string | null
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          headman: string | null
          headman_id: string | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string | null
          number_children: string | null
          number_children_count: number | null
        }
        Insert: {
          area?: string | null
          area_id?: string | null
          attendance_updated?: string | null
          chief?: string | null
          chief_id?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          headman?: string | null
          headman_id?: string | null
          id: string
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          number_children?: string | null
          number_children_count?: number | null
        }
        Update: {
          area?: string | null
          area_id?: string | null
          attendance_updated?: string | null
          chief?: string | null
          chief_id?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          headman?: string | null
          headman_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          number_children?: string | null
          number_children_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ecdc_list_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "area"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ecdc_list_chief_id_fkey"
            columns: ["chief_id"]
            isOneToOne: false
            referencedRelation: "traditional_leaders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ecdc_list_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ecdc_list_headman_id_fkey"
            columns: ["headman_id"]
            isOneToOne: false
            referencedRelation: "traditional_leaders"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          area_id: string | null
          created_at: string
          group_name: string
          id: string
          organisation: string | null
        }
        Insert: {
          area_id?: string | null
          created_at?: string
          group_name: string
          id?: string
          organisation?: string | null
        }
        Update: {
          area_id?: string | null
          created_at?: string
          group_name?: string
          id?: string
          organisation?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "groups_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "area"
            referencedColumns: ["id"]
          },
        ]
      }
      kobo_label: {
        Row: {
          id: string
          label: string
          list_name: string
          name: string
          order: number | null
        }
        Insert: {
          id?: string
          label: string
          list_name: string
          name: string
          order?: number | null
        }
        Update: {
          id?: string
          label?: string
          list_name?: string
          name?: string
          order?: number | null
        }
        Relationships: []
      }
      kobo_processed: {
        Row: {
          actor_id: string | null
          actor_type: string
          attempt_count: number
          correction_reason: string | null
          error_message: string | null
          instance_id: string
          last_run_id: string | null
          processed_at: string | null
          processing_started_at: string | null
          processor_version: string | null
          provenance: Json
          result_visit_id: string | null
          status: string | null
          warning_details: Json | null
          warnings: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_type?: string
          attempt_count?: number
          correction_reason?: string | null
          error_message?: string | null
          instance_id: string
          last_run_id?: string | null
          processed_at?: string | null
          processing_started_at?: string | null
          processor_version?: string | null
          provenance?: Json
          result_visit_id?: string | null
          status?: string | null
          warning_details?: Json | null
          warnings?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          attempt_count?: number
          correction_reason?: string | null
          error_message?: string | null
          instance_id?: string
          last_run_id?: string | null
          processed_at?: string | null
          processing_started_at?: string | null
          processor_version?: string | null
          provenance?: Json
          result_visit_id?: string | null
          status?: string | null
          warning_details?: Json | null
          warnings?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kobo_processed_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kobo_processed_result_visit_id_fkey"
            columns: ["result_visit_id"]
            isOneToOne: false
            referencedRelation: "kobo_reconciliation"
            referencedColumns: ["visible_visit_id"]
          },
          {
            foreignKeyName: "kobo_processed_result_visit_id_fkey"
            columns: ["result_visit_id"]
            isOneToOne: false
            referencedRelation: "outreach_duplicate_candidates"
            referencedColumns: ["visit_a_id"]
          },
          {
            foreignKeyName: "kobo_processed_result_visit_id_fkey"
            columns: ["result_visit_id"]
            isOneToOne: false
            referencedRelation: "outreach_duplicate_candidates"
            referencedColumns: ["visit_b_id"]
          },
          {
            foreignKeyName: "kobo_processed_result_visit_id_fkey"
            columns: ["result_visit_id"]
            isOneToOne: false
            referencedRelation: "outreach_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      kobo_processing_attempts: {
        Row: {
          actor_id: string | null
          actor_type: string
          error_message: string | null
          finished_at: string | null
          id: string
          instance_id: string
          metadata: Json
          payload_hash: string | null
          processor_version: string
          result_visit_id: string | null
          started_at: string
          status: string
          trigger_source: string
          warnings: Json | null
        }
        Insert: {
          actor_id?: string | null
          actor_type?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          instance_id: string
          metadata?: Json
          payload_hash?: string | null
          processor_version: string
          result_visit_id?: string | null
          started_at?: string
          status?: string
          trigger_source: string
          warnings?: Json | null
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          instance_id?: string
          metadata?: Json
          payload_hash?: string | null
          processor_version?: string
          result_visit_id?: string | null
          started_at?: string
          status?: string
          trigger_source?: string
          warnings?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "kobo_processing_attempts_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kobo_processing_attempts_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "kobo_raw_submissions"
            referencedColumns: ["instance_id"]
          },
          {
            foreignKeyName: "kobo_processing_attempts_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "kobo_reconciliation"
            referencedColumns: ["instance_id"]
          },
          {
            foreignKeyName: "kobo_processing_attempts_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "kobo_submission_monitor"
            referencedColumns: ["instance_id"]
          },
          {
            foreignKeyName: "kobo_processing_attempts_result_visit_id_fkey"
            columns: ["result_visit_id"]
            isOneToOne: false
            referencedRelation: "kobo_reconciliation"
            referencedColumns: ["visible_visit_id"]
          },
          {
            foreignKeyName: "kobo_processing_attempts_result_visit_id_fkey"
            columns: ["result_visit_id"]
            isOneToOne: false
            referencedRelation: "outreach_duplicate_candidates"
            referencedColumns: ["visit_a_id"]
          },
          {
            foreignKeyName: "kobo_processing_attempts_result_visit_id_fkey"
            columns: ["result_visit_id"]
            isOneToOne: false
            referencedRelation: "outreach_duplicate_candidates"
            referencedColumns: ["visit_b_id"]
          },
          {
            foreignKeyName: "kobo_processing_attempts_result_visit_id_fkey"
            columns: ["result_visit_id"]
            isOneToOne: false
            referencedRelation: "outreach_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      kobo_raw_submissions: {
        Row: {
          first_received_at: string | null
          instance_id: string
          kobo_form_uuid: string | null
          kobo_geolocation: Json | null
          kobo_meta_instance_id: string | null
          kobo_notes: Json | null
          kobo_status: string | null
          kobo_submission_id: string | null
          kobo_submission_time: string | null
          kobo_submitted_by: string | null
          kobo_tags: Json | null
          kobo_uuid: string | null
          kobo_validation_status: Json | null
          last_received_at: string | null
          payload: Json | null
          payload_hash: string | null
          receive_count: number
          source_system: string
          submitted_at: string | null
        }
        Insert: {
          first_received_at?: string | null
          instance_id: string
          kobo_form_uuid?: string | null
          kobo_geolocation?: Json | null
          kobo_meta_instance_id?: string | null
          kobo_notes?: Json | null
          kobo_status?: string | null
          kobo_submission_id?: string | null
          kobo_submission_time?: string | null
          kobo_submitted_by?: string | null
          kobo_tags?: Json | null
          kobo_uuid?: string | null
          kobo_validation_status?: Json | null
          last_received_at?: string | null
          payload?: Json | null
          payload_hash?: string | null
          receive_count?: number
          source_system?: string
          submitted_at?: string | null
        }
        Update: {
          first_received_at?: string | null
          instance_id?: string
          kobo_form_uuid?: string | null
          kobo_geolocation?: Json | null
          kobo_meta_instance_id?: string | null
          kobo_notes?: Json | null
          kobo_status?: string | null
          kobo_submission_id?: string | null
          kobo_submission_time?: string | null
          kobo_submitted_by?: string | null
          kobo_tags?: Json | null
          kobo_uuid?: string | null
          kobo_validation_status?: Json | null
          last_received_at?: string | null
          payload?: Json | null
          payload_hash?: string | null
          receive_count?: number
          source_system?: string
          submitted_at?: string | null
        }
        Relationships: []
      }
      kobo_resolution_ledger: {
        Row: {
          accepted_exception: string | null
          canonical_ecdc_id: string | null
          canonical_practitioner_ids: string[]
          decision: Json
          imported_at: string
          imported_by: string | null
          reason_code: string
          responsible_staff_user_id: string | null
          reviewed_at: string | null
          reviewer: string | null
          source_fingerprint: string
          source_identity: string
          source_sha256: string
        }
        Insert: {
          accepted_exception?: string | null
          canonical_ecdc_id?: string | null
          canonical_practitioner_ids?: string[]
          decision: Json
          imported_at?: string
          imported_by?: string | null
          reason_code: string
          responsible_staff_user_id?: string | null
          reviewed_at?: string | null
          reviewer?: string | null
          source_fingerprint: string
          source_identity: string
          source_sha256: string
        }
        Update: {
          accepted_exception?: string | null
          canonical_ecdc_id?: string | null
          canonical_practitioner_ids?: string[]
          decision?: Json
          imported_at?: string
          imported_by?: string | null
          reason_code?: string
          responsible_staff_user_id?: string | null
          reviewed_at?: string | null
          reviewer?: string | null
          source_fingerprint?: string
          source_identity?: string
          source_sha256?: string
        }
        Relationships: [
          {
            foreignKeyName: "kobo_resolution_ledger_canonical_ecdc_id_fkey"
            columns: ["canonical_ecdc_id"]
            isOneToOne: false
            referencedRelation: "ecdc_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kobo_resolution_ledger_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kobo_resolution_ledger_responsible_staff_user_id_fkey"
            columns: ["responsible_staff_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kobo_unmatched: {
        Row: {
          created_at: string | null
          field: string | null
          id: string
          instance_id: string | null
          last_seen_at: string
          occurrence_count: number
          raw_value: string | null
          resolution_action: string | null
          resolution_reason: string | null
          resolved_at: string | null
          resolved_by: string | null
          resolved_id: string | null
        }
        Insert: {
          created_at?: string | null
          field?: string | null
          id?: string
          instance_id?: string | null
          last_seen_at?: string
          occurrence_count?: number
          raw_value?: string | null
          resolution_action?: string | null
          resolution_reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_id?: string | null
        }
        Update: {
          created_at?: string | null
          field?: string | null
          id?: string
          instance_id?: string | null
          last_seen_at?: string
          occurrence_count?: number
          raw_value?: string | null
          resolution_action?: string | null
          resolution_reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kobo_unmatched_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "kobo_raw_submissions"
            referencedColumns: ["instance_id"]
          },
          {
            foreignKeyName: "kobo_unmatched_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "kobo_reconciliation"
            referencedColumns: ["instance_id"]
          },
          {
            foreignKeyName: "kobo_unmatched_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "kobo_submission_monitor"
            referencedColumns: ["instance_id"]
          },
          {
            foreignKeyName: "kobo_unmatched_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      landmarks: {
        Row: {
          created_at: string
          id: number
          latitude: number | null
          longitude: number | null
          name: string | null
          type: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          type?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          type?: string | null
        }
        Relationships: []
      }
      layita_staff: {
        Row: {
          created_at: string
          id: string
          name: string
          role: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          role?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          role?: string | null
        }
        Relationships: []
      }
      outreach_attachments: {
        Row: {
          attempt_count: number
          byte_size: number | null
          created_at: string
          id: string
          last_attempt_at: string | null
          last_error: string | null
          mime_type: string | null
          source_field: string
          source_filename: string
          source_instance_id: string
          source_system: string
          storage_bucket: string | null
          storage_path: string | null
          transfer_status: string
          transferred_at: string | null
          updated_at: string
          visit_id: string
        }
        Insert: {
          attempt_count?: number
          byte_size?: number | null
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          mime_type?: string | null
          source_field: string
          source_filename: string
          source_instance_id: string
          source_system?: string
          storage_bucket?: string | null
          storage_path?: string | null
          transfer_status?: string
          transferred_at?: string | null
          updated_at?: string
          visit_id: string
        }
        Update: {
          attempt_count?: number
          byte_size?: number | null
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          mime_type?: string | null
          source_field?: string
          source_filename?: string
          source_instance_id?: string
          source_system?: string
          storage_bucket?: string | null
          storage_path?: string | null
          transfer_status?: string
          transferred_at?: string | null
          updated_at?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_attachments_source_instance_id_fkey"
            columns: ["source_instance_id"]
            isOneToOne: false
            referencedRelation: "kobo_raw_submissions"
            referencedColumns: ["instance_id"]
          },
          {
            foreignKeyName: "outreach_attachments_source_instance_id_fkey"
            columns: ["source_instance_id"]
            isOneToOne: false
            referencedRelation: "kobo_reconciliation"
            referencedColumns: ["instance_id"]
          },
          {
            foreignKeyName: "outreach_attachments_source_instance_id_fkey"
            columns: ["source_instance_id"]
            isOneToOne: false
            referencedRelation: "kobo_submission_monitor"
            referencedColumns: ["instance_id"]
          },
          {
            foreignKeyName: "outreach_attachments_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "kobo_reconciliation"
            referencedColumns: ["visible_visit_id"]
          },
          {
            foreignKeyName: "outreach_attachments_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "outreach_duplicate_candidates"
            referencedColumns: ["visit_a_id"]
          },
          {
            foreignKeyName: "outreach_attachments_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "outreach_duplicate_candidates"
            referencedColumns: ["visit_b_id"]
          },
          {
            foreignKeyName: "outreach_attachments_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "outreach_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_visit_practitioners: {
        Row: {
          created_at: string
          notes: string | null
          participation_role: string
          practitioner_id: string
          visit_id: string
          was_planned: boolean | null
        }
        Insert: {
          created_at?: string
          notes?: string | null
          participation_role?: string
          practitioner_id: string
          visit_id: string
          was_planned?: boolean | null
        }
        Update: {
          created_at?: string
          notes?: string | null
          participation_role?: string
          practitioner_id?: string
          visit_id?: string
          was_planned?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "outreach_visit_practitioners_practitioner_id_fkey"
            columns: ["practitioner_id"]
            isOneToOne: false
            referencedRelation: "practitioners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_visit_practitioners_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "kobo_reconciliation"
            referencedColumns: ["visible_visit_id"]
          },
          {
            foreignKeyName: "outreach_visit_practitioners_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "outreach_duplicate_candidates"
            referencedColumns: ["visit_a_id"]
          },
          {
            foreignKeyName: "outreach_visit_practitioners_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "outreach_duplicate_candidates"
            referencedColumns: ["visit_b_id"]
          },
          {
            foreignKeyName: "outreach_visit_practitioners_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "outreach_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_visit_resolutions: {
        Row: {
          action: string
          discarded_visit_id: string
          id: string
          kept_visit_id: string | null
          reason: string
          resolved_at: string
          resolved_by: string
          snapshot: Json
        }
        Insert: {
          action: string
          discarded_visit_id: string
          id?: string
          kept_visit_id?: string | null
          reason: string
          resolved_at?: string
          resolved_by: string
          snapshot: Json
        }
        Update: {
          action?: string
          discarded_visit_id?: string
          id?: string
          kept_visit_id?: string | null
          reason?: string
          resolved_at?: string
          resolved_by?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "outreach_visit_resolutions_discarded_visit_id_fkey"
            columns: ["discarded_visit_id"]
            isOneToOne: false
            referencedRelation: "kobo_reconciliation"
            referencedColumns: ["visible_visit_id"]
          },
          {
            foreignKeyName: "outreach_visit_resolutions_discarded_visit_id_fkey"
            columns: ["discarded_visit_id"]
            isOneToOne: false
            referencedRelation: "outreach_duplicate_candidates"
            referencedColumns: ["visit_a_id"]
          },
          {
            foreignKeyName: "outreach_visit_resolutions_discarded_visit_id_fkey"
            columns: ["discarded_visit_id"]
            isOneToOne: false
            referencedRelation: "outreach_duplicate_candidates"
            referencedColumns: ["visit_b_id"]
          },
          {
            foreignKeyName: "outreach_visit_resolutions_discarded_visit_id_fkey"
            columns: ["discarded_visit_id"]
            isOneToOne: false
            referencedRelation: "outreach_visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_visit_resolutions_kept_visit_id_fkey"
            columns: ["kept_visit_id"]
            isOneToOne: false
            referencedRelation: "kobo_reconciliation"
            referencedColumns: ["visible_visit_id"]
          },
          {
            foreignKeyName: "outreach_visit_resolutions_kept_visit_id_fkey"
            columns: ["kept_visit_id"]
            isOneToOne: false
            referencedRelation: "outreach_duplicate_candidates"
            referencedColumns: ["visit_a_id"]
          },
          {
            foreignKeyName: "outreach_visit_resolutions_kept_visit_id_fkey"
            columns: ["kept_visit_id"]
            isOneToOne: false
            referencedRelation: "outreach_duplicate_candidates"
            referencedColumns: ["visit_b_id"]
          },
          {
            foreignKeyName: "outreach_visit_resolutions_kept_visit_id_fkey"
            columns: ["kept_visit_id"]
            isOneToOne: false
            referencedRelation: "outreach_visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_visit_resolutions_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_visit_sources: {
        Row: {
          created_at: string
          external_id: string
          id: string
          metadata: Json
          original_visit_id: string | null
          payload_hash: string | null
          source_system: string
          visit_id: string
        }
        Insert: {
          created_at?: string
          external_id: string
          id?: string
          metadata?: Json
          original_visit_id?: string | null
          payload_hash?: string | null
          source_system: string
          visit_id: string
        }
        Update: {
          created_at?: string
          external_id?: string
          id?: string
          metadata?: Json
          original_visit_id?: string | null
          payload_hash?: string | null
          source_system?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_visit_sources_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "kobo_reconciliation"
            referencedColumns: ["visible_visit_id"]
          },
          {
            foreignKeyName: "outreach_visit_sources_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "outreach_duplicate_candidates"
            referencedColumns: ["visit_a_id"]
          },
          {
            foreignKeyName: "outreach_visit_sources_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "outreach_duplicate_candidates"
            referencedColumns: ["visit_b_id"]
          },
          {
            foreignKeyName: "outreach_visit_sources_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "outreach_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_visits: {
        Row: {
          attendance_rate_percent: number | null
          bookdash_given: boolean | null
          books_distributed_to_children: number | null
          books_left_with_practitioner: number | null
          books_per_child: number | null
          books_to_practitioner: number | null
          capture_ended_at: string | null
          capture_started_at: string | null
          captured_accuracy_m: number | null
          captured_altitude_m: number | null
          captured_latitude: number | null
          captured_longitude: number | null
          children_books: number | null
          children_receiving_books: number | null
          comments: string | null
          created_at: string
          data_capturer_id: string | null
          date: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          did_instead: string | null
          id: string
          kobo_instance_id: string | null
          outreach_happened: string | null
          outreach_type: string | null
          parents_attending: number | null
          parents_enrolled: number | null
          parents_trained: number | null
          people_reached: number | null
          photo_album_url: string | null
          photos_taken: boolean | null
          photos_uploaded_to_album: boolean | null
          practitioner_id: string | null
          public_transport_accessible: boolean | null
          resolution_reason: string | null
          resolution_status: string
          resolved_at: string | null
          resolved_by: string | null
          source: string | null
          superseded_by_id: string | null
          transport_cost: number | null
          transport_km: number | null
          transport_type: string | null
        }
        Insert: {
          attendance_rate_percent?: number | null
          bookdash_given?: boolean | null
          books_distributed_to_children?: number | null
          books_left_with_practitioner?: number | null
          books_per_child?: number | null
          books_to_practitioner?: number | null
          capture_ended_at?: string | null
          capture_started_at?: string | null
          captured_accuracy_m?: number | null
          captured_altitude_m?: number | null
          captured_latitude?: number | null
          captured_longitude?: number | null
          children_books?: number | null
          children_receiving_books?: number | null
          comments?: string | null
          created_at?: string
          data_capturer_id?: string | null
          date?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          did_instead?: string | null
          id?: string
          kobo_instance_id?: string | null
          outreach_happened?: string | null
          outreach_type?: string | null
          parents_attending?: number | null
          parents_enrolled?: number | null
          parents_trained?: number | null
          people_reached?: number | null
          photo_album_url?: string | null
          photos_taken?: boolean | null
          photos_uploaded_to_album?: boolean | null
          practitioner_id?: string | null
          public_transport_accessible?: boolean | null
          resolution_reason?: string | null
          resolution_status?: string
          resolved_at?: string | null
          resolved_by?: string | null
          source?: string | null
          superseded_by_id?: string | null
          transport_cost?: number | null
          transport_km?: number | null
          transport_type?: string | null
        }
        Update: {
          attendance_rate_percent?: number | null
          bookdash_given?: boolean | null
          books_distributed_to_children?: number | null
          books_left_with_practitioner?: number | null
          books_per_child?: number | null
          books_to_practitioner?: number | null
          capture_ended_at?: string | null
          capture_started_at?: string | null
          captured_accuracy_m?: number | null
          captured_altitude_m?: number | null
          captured_latitude?: number | null
          captured_longitude?: number | null
          children_books?: number | null
          children_receiving_books?: number | null
          comments?: string | null
          created_at?: string
          data_capturer_id?: string | null
          date?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          did_instead?: string | null
          id?: string
          kobo_instance_id?: string | null
          outreach_happened?: string | null
          outreach_type?: string | null
          parents_attending?: number | null
          parents_enrolled?: number | null
          parents_trained?: number | null
          people_reached?: number | null
          photo_album_url?: string | null
          photos_taken?: boolean | null
          photos_uploaded_to_album?: boolean | null
          practitioner_id?: string | null
          public_transport_accessible?: boolean | null
          resolution_reason?: string | null
          resolution_status?: string
          resolved_at?: string | null
          resolved_by?: string | null
          source?: string | null
          superseded_by_id?: string | null
          transport_cost?: number | null
          transport_km?: number | null
          transport_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outreach_visits_data_capturer_id_fkey"
            columns: ["data_capturer_id"]
            isOneToOne: false
            referencedRelation: "layita_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_visits_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_visits_kobo_instance_id_fkey"
            columns: ["kobo_instance_id"]
            isOneToOne: true
            referencedRelation: "kobo_raw_submissions"
            referencedColumns: ["instance_id"]
          },
          {
            foreignKeyName: "outreach_visits_kobo_instance_id_fkey"
            columns: ["kobo_instance_id"]
            isOneToOne: true
            referencedRelation: "kobo_reconciliation"
            referencedColumns: ["instance_id"]
          },
          {
            foreignKeyName: "outreach_visits_kobo_instance_id_fkey"
            columns: ["kobo_instance_id"]
            isOneToOne: true
            referencedRelation: "kobo_submission_monitor"
            referencedColumns: ["instance_id"]
          },
          {
            foreignKeyName: "outreach_visits_practitioner_id_fkey"
            columns: ["practitioner_id"]
            isOneToOne: false
            referencedRelation: "practitioners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_visits_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_visits_superseded_by_id_fkey"
            columns: ["superseded_by_id"]
            isOneToOne: false
            referencedRelation: "kobo_reconciliation"
            referencedColumns: ["visible_visit_id"]
          },
          {
            foreignKeyName: "outreach_visits_superseded_by_id_fkey"
            columns: ["superseded_by_id"]
            isOneToOne: false
            referencedRelation: "outreach_duplicate_candidates"
            referencedColumns: ["visit_a_id"]
          },
          {
            foreignKeyName: "outreach_visits_superseded_by_id_fkey"
            columns: ["superseded_by_id"]
            isOneToOne: false
            referencedRelation: "outreach_duplicate_candidates"
            referencedColumns: ["visit_b_id"]
          },
          {
            foreignKeyName: "outreach_visits_superseded_by_id_fkey"
            columns: ["superseded_by_id"]
            isOneToOne: false
            referencedRelation: "outreach_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      planned_visits: {
        Row: {
          assigned_to: string | null
          created_at: string
          id: string
          outreach_type: string
          practitioner_id: string
          practitioner_name: string
          scheduled_date: string
          status: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          id?: string
          outreach_type: string
          practitioner_id: string
          practitioner_name: string
          scheduled_date: string
          status: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          id?: string
          outreach_type?: string
          practitioner_id?: string
          practitioner_name?: string
          scheduled_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "planned_visits_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "layita_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_visits_practitioner_id_fkey"
            columns: ["practitioner_id"]
            isOneToOne: false
            referencedRelation: "practitioners"
            referencedColumns: ["id"]
          },
        ]
      }
      practitioner_group_history: {
        Row: {
          changed_at: string
          changed_by_id: string | null
          ended_on: string | null
          group_id: string | null
          group_name: string | null
          id: string
          practitioner_id: string
          reason: string | null
          started_on: string
        }
        Insert: {
          changed_at?: string
          changed_by_id?: string | null
          ended_on?: string | null
          group_id?: string | null
          group_name?: string | null
          id?: string
          practitioner_id: string
          reason?: string | null
          started_on?: string
        }
        Update: {
          changed_at?: string
          changed_by_id?: string | null
          ended_on?: string | null
          group_id?: string | null
          group_name?: string | null
          id?: string
          practitioner_id?: string
          reason?: string | null
          started_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "practitioner_group_history_changed_by_id_fkey"
            columns: ["changed_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practitioner_group_history_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practitioner_group_history_practitioner_id_fkey"
            columns: ["practitioner_id"]
            isOneToOne: false
            referencedRelation: "practitioners"
            referencedColumns: ["id"]
          },
        ]
      }
      practitioner_lifecycle_events: {
        Row: {
          changed_at: string
          changed_by_id: string | null
          comment: string | null
          effective_on: string
          id: string
          practitioner_id: string
          reason: string | null
          source: string
          status: string
        }
        Insert: {
          changed_at?: string
          changed_by_id?: string | null
          comment?: string | null
          effective_on?: string
          id?: string
          practitioner_id: string
          reason?: string | null
          source?: string
          status: string
        }
        Update: {
          changed_at?: string
          changed_by_id?: string | null
          comment?: string | null
          effective_on?: string
          id?: string
          practitioner_id?: string
          reason?: string | null
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "practitioner_lifecycle_events_changed_by_id_fkey"
            columns: ["changed_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practitioner_lifecycle_events_practitioner_id_fkey"
            columns: ["practitioner_id"]
            isOneToOne: false
            referencedRelation: "practitioners"
            referencedColumns: ["id"]
          },
        ]
      }
      practitioners: {
        Row: {
          contact_number1: string | null
          contact_number2: string | null
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          dsd_funded: boolean | null
          dsd_registered: boolean | null
          ecdc_id: string | null
          group: string | null
          group_id: string | null
          has_whatsapp: boolean | null
          id: string
          name: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          contact_number1?: string | null
          contact_number2?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          dsd_funded?: boolean | null
          dsd_registered?: boolean | null
          ecdc_id?: string | null
          group?: string | null
          group_id?: string | null
          has_whatsapp?: boolean | null
          id?: string
          name?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          contact_number1?: string | null
          contact_number2?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          dsd_funded?: boolean | null
          dsd_registered?: boolean | null
          ecdc_id?: string | null
          group?: string | null
          group_id?: string | null
          has_whatsapp?: boolean | null
          id?: string
          name?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "practitioners_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practitioners_ecdc_id_fkey"
            columns: ["ecdc_id"]
            isOneToOne: false
            referencedRelation: "ecdc_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practitioners_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          layita_staff_id: string | null
          name: string | null
          role: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          layita_staff_id?: string | null
          name?: string | null
          role?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          layita_staff_id?: string | null
          name?: string | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_layita_staff_id_fkey"
            columns: ["layita_staff_id"]
            isOneToOne: false
            referencedRelation: "layita_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      traditional_leader_aliases: {
        Row: {
          alias: string
          created_at: string
          id: string
          leader_id: string
          leader_type: string
        }
        Insert: {
          alias: string
          created_at?: string
          id?: string
          leader_id: string
          leader_type: string
        }
        Update: {
          alias?: string
          created_at?: string
          id?: string
          leader_id?: string
          leader_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "traditional_leader_aliases_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "traditional_leaders"
            referencedColumns: ["id"]
          },
        ]
      }
      traditional_leaders: {
        Row: {
          active: boolean
          canonical_name: string
          created_at: string
          created_by_id: string | null
          id: string
          leader_type: string
          needs_review: boolean
        }
        Insert: {
          active?: boolean
          canonical_name: string
          created_at?: string
          created_by_id?: string | null
          id?: string
          leader_type: string
          needs_review?: boolean
        }
        Update: {
          active?: boolean
          canonical_name?: string
          created_at?: string
          created_by_id?: string | null
          id?: string
          leader_type?: string
          needs_review?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "traditional_leaders_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      training: {
        Row: {
          created_at: string
          first_aid_date: string | null
          first_aid_ever: boolean | null
          id: string
          level4_date: string | null
          level4_ever: boolean | null
          level5_date: string | null
          level5_ever: boolean | null
          littlestars_date: string | null
          littlestars_ever: boolean | null
          other: string | null
          other_date: string | null
          smart_start_date: string | null
          smart_start_ever: boolean | null
          wordworks03_date: string | null
          wordworks03_ever: boolean | null
          wordworks35_date: string | null
          wordworks35_ever: boolean | null
        }
        Insert: {
          created_at?: string
          first_aid_date?: string | null
          first_aid_ever?: boolean | null
          id: string
          level4_date?: string | null
          level4_ever?: boolean | null
          level5_date?: string | null
          level5_ever?: boolean | null
          littlestars_date?: string | null
          littlestars_ever?: boolean | null
          other?: string | null
          other_date?: string | null
          smart_start_date?: string | null
          smart_start_ever?: boolean | null
          wordworks03_date?: string | null
          wordworks03_ever?: boolean | null
          wordworks35_date?: string | null
          wordworks35_ever?: boolean | null
        }
        Update: {
          created_at?: string
          first_aid_date?: string | null
          first_aid_ever?: boolean | null
          id?: string
          level4_date?: string | null
          level4_ever?: boolean | null
          level5_date?: string | null
          level5_ever?: boolean | null
          littlestars_date?: string | null
          littlestars_ever?: boolean | null
          other?: string | null
          other_date?: string | null
          smart_start_date?: string | null
          smart_start_ever?: boolean | null
          wordworks03_date?: string | null
          wordworks03_ever?: boolean | null
          wordworks35_date?: string | null
          wordworks35_ever?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "training_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "practitioners"
            referencedColumns: ["id"]
          },
        ]
      }
      training_courses: {
        Row: {
          active: boolean
          code: string
          created_at: string
          name: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          name: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          name?: string
        }
        Relationships: []
      }
      training_events: {
        Row: {
          completed_on: string | null
          course_code: string
          created_at: string
          created_by_id: string | null
          id: string
          notes: string | null
          practitioner_id: string
          provider: string | null
          source: string
        }
        Insert: {
          completed_on?: string | null
          course_code: string
          created_at?: string
          created_by_id?: string | null
          id?: string
          notes?: string | null
          practitioner_id: string
          provider?: string | null
          source?: string
        }
        Update: {
          completed_on?: string | null
          course_code?: string
          created_at?: string
          created_by_id?: string | null
          id?: string
          notes?: string | null
          practitioner_id?: string
          provider?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_events_course_code_fkey"
            columns: ["course_code"]
            isOneToOne: false
            referencedRelation: "training_courses"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "training_events_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_events_practitioner_id_fkey"
            columns: ["practitioner_id"]
            isOneToOne: false
            referencedRelation: "practitioners"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_requirements: {
        Row: {
          area_id: string | null
          created_at: string
          id: string
          minimum_visits_per_year: number | null
        }
        Insert: {
          area_id?: string | null
          created_at?: string
          id?: string
          minimum_visits_per_year?: number | null
        }
        Update: {
          area_id?: string | null
          created_at?: string
          id?: string
          minimum_visits_per_year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "visit_requirements_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "area"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      data_quality_summary: {
        Row: {
          label: string | null
          metric_key: string | null
          severity: string | null
          value: number | null
        }
        Relationships: []
      }
      human_audit_logs: {
        Row: {
          changed_at: string | null
          changed_by_name: string | null
          field_name: string | null
          id: string | null
          new_val: string | null
          old_val: string | null
          record_id: string | null
          record_name: string | null
          table_name: string | null
        }
        Relationships: []
      }
      kobo_reconciliation: {
        Row: {
          action_required: boolean | null
          attempt_count: number | null
          error_message: string | null
          instance_id: string | null
          last_received_at: string | null
          ledger_reason_code: string | null
          payload_hash: string | null
          processed_at: string | null
          processing_status: string | null
          receive_count: number | null
          reconciliation_state: string | null
          resolution_status: string | null
          result_visit_id: string | null
          submitted_at: string | null
          unresolved_count: number | null
          visible_visit_id: string | null
          visit_deleted_at: string | null
          warning_details: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "kobo_processed_result_visit_id_fkey"
            columns: ["result_visit_id"]
            isOneToOne: false
            referencedRelation: "kobo_reconciliation"
            referencedColumns: ["visible_visit_id"]
          },
          {
            foreignKeyName: "kobo_processed_result_visit_id_fkey"
            columns: ["result_visit_id"]
            isOneToOne: false
            referencedRelation: "outreach_duplicate_candidates"
            referencedColumns: ["visit_a_id"]
          },
          {
            foreignKeyName: "kobo_processed_result_visit_id_fkey"
            columns: ["result_visit_id"]
            isOneToOne: false
            referencedRelation: "outreach_duplicate_candidates"
            referencedColumns: ["visit_b_id"]
          },
          {
            foreignKeyName: "kobo_processed_result_visit_id_fkey"
            columns: ["result_visit_id"]
            isOneToOne: false
            referencedRelation: "outreach_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      kobo_submission_monitor: {
        Row: {
          data_capturer: string | null
          ecdc_name: string | null
          error_message: string | null
          instance_id: string | null
          outreach_date: string | null
          outreach_type: string | null
          payload: Json | null
          practitioner_name: string | null
          processed_at: string | null
          processing_seconds: number | null
          processing_state: string | null
          status: string | null
          submitted_at: string | null
          warnings: string | null
        }
        Relationships: []
      }
      kobotoolbox_ecdc_export: {
        Row: {
          area: string | null
          ecdc_dsd: string | null
          ecdc_practitioner: string | null
          franchise_group: string | null
          label: string | null
          list_name: string | null
          name: string | null
        }
        Relationships: []
      }
      kobotoolbox_practitioners_export: {
        Row: {
          contact1: string | null
          contact2: string | null
          ecdc: string | null
          label: string | null
          list_name: string | null
          name: string | null
        }
        Relationships: []
      }
      outreach_duplicate_candidates: {
        Row: {
          confidence_score: number | null
          data_capturer_id: string | null
          date: string | null
          instance_a: string | null
          instance_b: string | null
          practitioner_id: string | null
          visit_a_id: string | null
          visit_b_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outreach_visits_data_capturer_id_fkey"
            columns: ["data_capturer_id"]
            isOneToOne: false
            referencedRelation: "layita_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_visits_kobo_instance_id_fkey"
            columns: ["instance_b"]
            isOneToOne: true
            referencedRelation: "kobo_raw_submissions"
            referencedColumns: ["instance_id"]
          },
          {
            foreignKeyName: "outreach_visits_kobo_instance_id_fkey"
            columns: ["instance_a"]
            isOneToOne: true
            referencedRelation: "kobo_raw_submissions"
            referencedColumns: ["instance_id"]
          },
          {
            foreignKeyName: "outreach_visits_kobo_instance_id_fkey"
            columns: ["instance_b"]
            isOneToOne: true
            referencedRelation: "kobo_reconciliation"
            referencedColumns: ["instance_id"]
          },
          {
            foreignKeyName: "outreach_visits_kobo_instance_id_fkey"
            columns: ["instance_a"]
            isOneToOne: true
            referencedRelation: "kobo_reconciliation"
            referencedColumns: ["instance_id"]
          },
          {
            foreignKeyName: "outreach_visits_kobo_instance_id_fkey"
            columns: ["instance_b"]
            isOneToOne: true
            referencedRelation: "kobo_submission_monitor"
            referencedColumns: ["instance_id"]
          },
          {
            foreignKeyName: "outreach_visits_kobo_instance_id_fkey"
            columns: ["instance_a"]
            isOneToOne: true
            referencedRelation: "kobo_submission_monitor"
            referencedColumns: ["instance_id"]
          },
          {
            foreignKeyName: "outreach_visits_practitioner_id_fkey"
            columns: ["practitioner_id"]
            isOneToOne: false
            referencedRelation: "practitioners"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      begin_kobo_processing: {
        Args: {
          p_actor_id?: string
          p_force?: boolean
          p_instance_id: string
          p_payload_hash?: string
          p_processor_version: string
          p_trigger_source: string
        }
        Returns: string
      }
      correct_outreach_visit: {
        Args: { p_changes: Json; p_reason: string; p_visit_id: string }
        Returns: Json
      }
      find_similar_practitioners: {
        Args: { search_name: string }
        Returns: {
          ecdc_name: string
          id: string
          name: string
          similarity: number
        }[]
      }
      finish_kobo_processing: {
        Args: {
          p_error_message?: string
          p_provenance?: Json
          p_result_visit_id?: string
          p_run_id: string
          p_status: string
          p_warnings?: Json
        }
        Returns: undefined
      }
      get_deleted_ecdcs: {
        Args: never
        Returns: {
          area: string
          area_id: string
          attendance_updated: string
          chief: string
          created_at: string
          deleted_at: string
          headman: string
          id: string
          latitude: number
          longitude: number
          name: string
          number_children: string
        }[]
      }
      get_deleted_outreach_visits: {
        Args: never
        Returns: {
          books_per_child: number
          books_to_practitioner: number
          children_books: number
          comments: string
          created_at: string
          data_capturer_id: string
          date: string
          deleted_at: string
          did_instead: string
          id: string
          kobo_instance_id: string
          outreach_happened: string
          outreach_type: string
          parents_enrolled: number
          parents_trained: number
          people_reached: number
          photos_taken: boolean
          practitioner_id: string
          source: string
          transport_cost: number
          transport_km: number
          transport_type: string
        }[]
      }
      get_deleted_practitioners: {
        Args: never
        Returns: {
          contact_number1: string
          contact_number2: string
          created_at: string
          deleted_at: string
          dsd_funded: boolean
          dsd_registered: boolean
          ecdc_id: string
          group: string
          group_id: string
          has_whatsapp: boolean
          id: string
          name: string
          status: string
          updated_at: string
        }[]
      }
      get_my_role: { Args: never; Returns: string }
      hard_delete_ecdc: { Args: { e_id: string }; Returns: Json }
      hard_delete_outreach_visit: { Args: { v_id: string }; Returns: Json }
      hard_delete_practitioner: { Args: { p_id: string }; Returns: Json }
      merge_ecdcs: {
        Args: { discard_id: string; field_choices?: Json; keep_id: string }
        Returns: Json
      }
      merge_practitioners: {
        Args: { discard_id: string; field_choices?: Json; keep_id: string }
        Returns: Json
      }
      record_kobo_raw_submission: {
        Args: { p_instance_id: string; p_payload: Json; p_payload_hash: string }
        Returns: undefined
      }
      record_kobo_unmatched: {
        Args: { p_field: string; p_instance_id: string; p_raw_value: string }
        Returns: string
      }
      refresh_dashboard_views: { Args: never; Returns: undefined }
      resolve_duplicate_outreach_visit: {
        Args: {
          p_action?: string
          p_discard_id: string
          p_keep_id: string
          p_reason: string
        }
        Returns: Json
      }
      resolve_ecdc_external_id: {
        Args: { raw_value: string }
        Returns: {
          id: string
          name: string
        }[]
      }
      resolve_practitioner_external_id: {
        Args: { raw_value: string }
        Returns: {
          id: string
          name: string
        }[]
      }
      resolve_unmatched_submission: {
        Args: {
          p_note?: string
          p_resolution_type?: string
          p_resolved_id?: string
          p_unmatched_id: string
        }
        Returns: Json
      }
      restore_ecdc: { Args: { e_id: string }; Returns: Json }
      restore_outreach_visit: { Args: { v_id: string }; Returns: Json }
      restore_practitioner: { Args: { p_id: string }; Returns: Json }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      soft_delete_ecdc: { Args: { e_id: string }; Returns: Json }
      soft_delete_outreach_visit: { Args: { v_id: string }; Returns: Json }
      soft_delete_practitioner: { Args: { p_id: string }; Returns: Json }
      try_parse_double_precision: { Args: { p_value: string }; Returns: number }
      try_parse_timestamptz: { Args: { p_value: string }; Returns: string }
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
  public: {
    Enums: {},
  },
} as const
