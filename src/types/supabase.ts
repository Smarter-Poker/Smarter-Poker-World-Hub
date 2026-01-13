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
      achievements: {
        Row: {
          id: string
          orb_id: number | null
          title: string | null
          unlocked_at: string | null
          user_id: string | null
        }
        Insert: {
          id?: string
          orb_id?: number | null
          title?: string | null
          unlocked_at?: string | null
          user_id?: string | null
        }
        Update: {
          id?: string
          orb_id?: number | null
          title?: string | null
          unlocked_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "achievements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      arcade_games: {
        Row: {
          game_name: string | null
          id: string
          min_bet: number | null
          orb_id: number | null
        }
        Insert: {
          game_name?: string | null
          id?: string
          min_bet?: number | null
          orb_id?: number | null
        }
        Update: {
          game_name?: string | null
          id?: string
          min_bet?: number | null
          orb_id?: number | null
        }
        Relationships: []
      }
      arena_orbs: {
        Row: {
          color_code: string | null
          id: number
          orb_name: string
        }
        Insert: {
          color_code?: string | null
          id: number
          orb_name: string
        }
        Update: {
          color_code?: string | null
          id?: number
          orb_name?: string
        }
        Relationships: []
      }
      celebration_queue: {
        Row: {
          created_at: string | null
          diamonds: number
          dismissed: boolean | null
          icon: string | null
          id: string
          message: string | null
          rarity: string
          reward_id: string
          reward_name: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          diamonds: number
          dismissed?: boolean | null
          icon?: string | null
          id?: string
          message?: string | null
          rarity?: string
          reward_id: string
          reward_name?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          diamonds?: number
          dismissed?: boolean | null
          icon?: string | null
          id?: string
          message?: string | null
          rarity?: string
          reward_id?: string
          reward_name?: string | null
          user_id?: string
        }
        Relationships: []
      }
      club_members: {
        Row: {
          agent_id: string | null
          club_id: string
          joined_at: string | null
          role: Database["public"]["Enums"]["member_role"] | null
          user_id: string
        }
        Insert: {
          agent_id?: string | null
          club_id: string
          joined_at?: string | null
          role?: Database["public"]["Enums"]["member_role"] | null
          user_id: string
        }
        Update: {
          agent_id?: string | null
          club_id?: string
          joined_at?: string | null
          role?: Database["public"]["Enums"]["member_role"] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_members_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_members_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs: {
        Row: {
          avatar_url: string | null
          club_id: number | null
          created_at: string | null
          description: string | null
          gps_restricted: boolean | null
          id: string
          is_public: boolean | null
          is_union: boolean | null
          name: string
          owner_id: string | null
          requires_approval: boolean | null
          settings: Json | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          club_id?: number | null
          created_at?: string | null
          description?: string | null
          gps_restricted?: boolean | null
          id?: string
          is_public?: boolean | null
          is_union?: boolean | null
          name: string
          owner_id?: string | null
          requires_approval?: boolean | null
          settings?: Json | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          club_id?: number | null
          created_at?: string | null
          description?: string | null
          gps_restricted?: boolean | null
          id?: string
          is_public?: boolean | null
          is_union?: boolean | null
          name?: string
          owner_id?: string | null
          requires_approval?: boolean | null
          settings?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clubs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      diamond_ledger: {
        Row: {
          balance_after: number | null
          created_at: string | null
          delta: number
          id: string
          type: string | null
          user_id: string | null
        }
        Insert: {
          balance_after?: number | null
          created_at?: string | null
          delta: number
          id?: string
          type?: string | null
          user_id?: string | null
        }
        Update: {
          balance_after?: number | null
          created_at?: string | null
          delta?: number
          id?: string
          type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "diamond_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      drill_performance: {
        Row: {
          accuracy: number
          completed_at: string
          drill_type: string
          ev_loss: number | null
          gto_compliance: number | null
          id: string
          metadata: Json | null
          session_id: string | null
          speed_score: number | null
          user_id: string
        }
        Insert: {
          accuracy: number
          completed_at?: string
          drill_type: string
          ev_loss?: number | null
          gto_compliance?: number | null
          id?: string
          metadata?: Json | null
          session_id?: string | null
          speed_score?: number | null
          user_id: string
        }
        Update: {
          accuracy?: number
          completed_at?: string
          drill_type?: string
          ev_loss?: number | null
          gto_compliance?: number | null
          id?: string
          metadata?: Json | null
          session_id?: string | null
          speed_score?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drill_performance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      drill_sessions: {
        Row: {
          completed_at: string | null
          id: string
          mistakes: Json | null
          scenario_id: string | null
          score: number
          time_taken_ms: number | null
          user_id: string | null
        }
        Insert: {
          completed_at?: string | null
          id?: string
          mistakes?: Json | null
          scenario_id?: string | null
          score: number
          time_taken_ms?: number | null
          user_id?: string | null
        }
        Update: {
          completed_at?: string | null
          id?: string
          mistakes?: Json | null
          scenario_id?: string | null
          score?: number
          time_taken_ms?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drill_sessions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "gto_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      game_tables: {
        Row: {
          bb_amount: number
          club_id: string | null
          created_at: string | null
          game_type: Database["public"]["Enums"]["game_type"]
          id: string
          is_active: boolean | null
          max_buyin: number
          max_seats: number | null
          min_buyin: number
          name: string
          sb_amount: number
        }
        Insert: {
          bb_amount: number
          club_id?: string | null
          created_at?: string | null
          game_type: Database["public"]["Enums"]["game_type"]
          id?: string
          is_active?: boolean | null
          max_buyin: number
          max_seats?: number | null
          min_buyin: number
          name: string
          sb_amount: number
        }
        Update: {
          bb_amount?: number
          club_id?: string | null
          created_at?: string | null
          game_type?: Database["public"]["Enums"]["game_type"]
          id?: string
          is_active?: boolean | null
          max_buyin?: number
          max_seats?: number | null
          min_buyin?: number
          name?: string
          sb_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "game_tables_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          category: string
          color: string | null
          created_at: string | null
          difficulty: number | null
          emoji: string | null
          focus: string
          id: string
          levels: number | null
          name: string
        }
        Insert: {
          category: string
          color?: string | null
          created_at?: string | null
          difficulty?: number | null
          emoji?: string | null
          focus: string
          id: string
          levels?: number | null
          name: string
        }
        Update: {
          category?: string
          color?: string | null
          created_at?: string | null
          difficulty?: number | null
          emoji?: string | null
          focus?: string
          id?: string
          levels?: number | null
          name?: string
        }
        Relationships: []
      }
      gto_scenarios: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          difficulty: string | null
          id: string
          solution: Json
          title: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          difficulty?: string | null
          id: string
          solution: Json
          title: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          difficulty?: string | null
          id?: string
          solution?: Json
          title?: string
        }
        Relationships: []
      }
      hand_history: {
        Row: {
          created_at: string | null
          id: string
          pot_size: number | null
          winner_name: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          pot_size?: number | null
          winner_name?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          pot_size?: number | null
          winner_name?: string | null
        }
        Relationships: []
      }
      marketplace_items: {
        Row: {
          id: string
          item_name: string | null
          orb_id: number | null
          price_diamonds: number | null
          seller_id: string | null
        }
        Insert: {
          id?: string
          item_name?: string | null
          orb_id?: number | null
          price_diamonds?: number | null
          seller_id?: string | null
        }
        Update: {
          id?: string
          item_name?: string | null
          orb_id?: number | null
          price_diamonds?: number | null
          seller_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_items_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      orb_activity_ledger: {
        Row: {
          created_at: string | null
          diamonds_delta: number | null
          id: string
          metadata: Json | null
          orb_id: number | null
          user_id: string | null
          xp_earned: number | null
        }
        Insert: {
          created_at?: string | null
          diamonds_delta?: number | null
          id?: string
          metadata?: Json | null
          orb_id?: number | null
          user_id?: string | null
          xp_earned?: number | null
        }
        Update: {
          created_at?: string | null
          diamonds_delta?: number | null
          id?: string
          metadata?: Json | null
          orb_id?: number | null
          user_id?: string | null
          xp_earned?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orb_activity_ledger_orb_id_fkey"
            columns: ["orb_id"]
            isOneToOne: false
            referencedRelation: "arena_orbs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orb_activity_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_dna_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      orb_activity_log: {
        Row: {
          action_type: string | null
          created_at: string | null
          id: string
          metadata: Json | null
          orb_id: number | null
          user_id: string | null
        }
        Insert: {
          action_type?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          orb_id?: number | null
          user_id?: string | null
        }
        Update: {
          action_type?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          orb_id?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orb_activity_log_orb_id_fkey"
            columns: ["orb_id"]
            isOneToOne: false
            referencedRelation: "orbs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orb_activity_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      orbs: {
        Row: {
          color_code: string | null
          id: number
          is_active: boolean | null
          name: string
        }
        Insert: {
          color_code?: string | null
          id: number
          is_active?: boolean | null
          name: string
        }
        Update: {
          color_code?: string | null
          id?: number
          is_active?: boolean | null
          name?: string
        }
        Relationships: []
      }
      player_traits: {
        Row: {
          adaptability_score: number | null
          aggression_score: number | null
          calculated_at: string | null
          grit_score: number | null
          risk_tolerance: number | null
          tilt_resistance: number | null
          user_id: string
        }
        Insert: {
          adaptability_score?: number | null
          aggression_score?: number | null
          calculated_at?: string | null
          grit_score?: number | null
          risk_tolerance?: number | null
          tilt_resistance?: number | null
          user_id: string
        }
        Update: {
          adaptability_score?: number | null
          aggression_score?: number | null
          calculated_at?: string | null
          grit_score?: number | null
          risk_tolerance?: number | null
          tilt_resistance?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_traits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_wallets: {
        Row: {
          chips: number | null
          diamonds: number | null
          updated_at: string | null
          user_id: string
          xp: number | null
        }
        Insert: {
          chips?: number | null
          diamonds?: number | null
          updated_at?: string | null
          user_id: string
          xp?: number | null
        }
        Update: {
          chips?: number | null
          diamonds?: number | null
          updated_at?: string | null
          user_id?: string
          xp?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "player_wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      poker_hands: {
        Row: {
          community_cards: Json
          created_at: string | null
          ended_at: string | null
          hand_number: number
          history: Json
          id: string
          player_snapshots: Json
          pot_total: number
          rake_amount: number | null
          started_at: string
          table_id: string
          winners: Json
        }
        Insert: {
          community_cards?: Json
          created_at?: string | null
          ended_at?: string | null
          hand_number: number
          history?: Json
          id?: string
          player_snapshots?: Json
          pot_total: number
          rake_amount?: number | null
          started_at: string
          table_id: string
          winners?: Json
        }
        Update: {
          community_cards?: Json
          created_at?: string | null
          ended_at?: string | null
          hand_number?: number
          history?: Json
          id?: string
          player_snapshots?: Json
          pot_total?: number
          rake_amount?: number | null
          started_at?: string
          table_id?: string
          winners?: Json
        }
        Relationships: [
          {
            foreignKeyName: "poker_hands_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "poker_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      poker_players: {
        Row: {
          buy_in_amount: number
          chip_stack: number
          current_bet: number | null
          hole_cards: Json | null
          id: string
          is_dealer: boolean | null
          is_turn: boolean | null
          joined_at: string | null
          last_action: string | null
          last_action_amount: number | null
          last_action_at: string | null
          last_seen_at: string | null
          seat_number: number
          status: string
          table_id: string
          time_bank: number | null
          total_bet_this_hand: number | null
          user_id: string
        }
        Insert: {
          buy_in_amount: number
          chip_stack: number
          current_bet?: number | null
          hole_cards?: Json | null
          id?: string
          is_dealer?: boolean | null
          is_turn?: boolean | null
          joined_at?: string | null
          last_action?: string | null
          last_action_amount?: number | null
          last_action_at?: string | null
          last_seen_at?: string | null
          seat_number: number
          status?: string
          table_id: string
          time_bank?: number | null
          total_bet_this_hand?: number | null
          user_id: string
        }
        Update: {
          buy_in_amount?: number
          chip_stack?: number
          current_bet?: number | null
          hole_cards?: Json | null
          id?: string
          is_dealer?: boolean | null
          is_turn?: boolean | null
          joined_at?: string | null
          last_action?: string | null
          last_action_amount?: number | null
          last_action_at?: string | null
          last_seen_at?: string | null
          seat_number?: number
          status?: string
          table_id?: string
          time_bank?: number | null
          total_bet_this_hand?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poker_players_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "poker_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      poker_stats: {
        Row: {
          aggression_factor: number | null
          best_streak: number | null
          biggest_pot_won: number | null
          current_streak: number | null
          hands_played: number | null
          hours_played: number | null
          pfr: number | null
          sessions_played: number | null
          skill_rating: number | null
          total_buy_ins: number | null
          total_cash_outs: number | null
          total_rake_paid: number | null
          total_winnings: number | null
          updated_at: string | null
          user_id: string
          vpip: number | null
          worst_streak: number | null
        }
        Insert: {
          aggression_factor?: number | null
          best_streak?: number | null
          biggest_pot_won?: number | null
          current_streak?: number | null
          hands_played?: number | null
          hours_played?: number | null
          pfr?: number | null
          sessions_played?: number | null
          skill_rating?: number | null
          total_buy_ins?: number | null
          total_cash_outs?: number | null
          total_rake_paid?: number | null
          total_winnings?: number | null
          updated_at?: string | null
          user_id: string
          vpip?: number | null
          worst_streak?: number | null
        }
        Update: {
          aggression_factor?: number | null
          best_streak?: number | null
          biggest_pot_won?: number | null
          current_streak?: number | null
          hands_played?: number | null
          hours_played?: number | null
          pfr?: number | null
          sessions_played?: number | null
          skill_rating?: number | null
          total_buy_ins?: number | null
          total_cash_outs?: number | null
          total_rake_paid?: number | null
          total_winnings?: number | null
          updated_at?: string | null
          user_id?: string
          vpip?: number | null
          worst_streak?: number | null
        }
        Relationships: []
      }
      poker_tables: {
        Row: {
          active_seat: number | null
          ante: number | null
          average_pot: number | null
          betting_structure: string
          big_blind: number
          community_cards: Json | null
          created_at: string | null
          created_by: string | null
          current_bet: number | null
          current_street: string | null
          dealer_seat: number | null
          game_type: string
          hand_number: number | null
          hands_played: number | null
          id: string
          is_private: boolean | null
          max_buy_in: number
          min_buy_in: number
          min_raise: number | null
          name: string
          password_hash: string | null
          pot_total: number | null
          small_blind: number
          status: string
          table_size: number
          time_limit: number
          updated_at: string | null
        }
        Insert: {
          active_seat?: number | null
          ante?: number | null
          average_pot?: number | null
          betting_structure?: string
          big_blind: number
          community_cards?: Json | null
          created_at?: string | null
          created_by?: string | null
          current_bet?: number | null
          current_street?: string | null
          dealer_seat?: number | null
          game_type: string
          hand_number?: number | null
          hands_played?: number | null
          id?: string
          is_private?: boolean | null
          max_buy_in: number
          min_buy_in: number
          min_raise?: number | null
          name: string
          password_hash?: string | null
          pot_total?: number | null
          small_blind: number
          status?: string
          table_size: number
          time_limit?: number
          updated_at?: string | null
        }
        Update: {
          active_seat?: number | null
          ante?: number | null
          average_pot?: number | null
          betting_structure?: string
          big_blind?: number
          community_cards?: Json | null
          created_at?: string | null
          created_by?: string | null
          current_bet?: number | null
          current_street?: string | null
          dealer_seat?: number | null
          game_type?: string
          hand_number?: number | null
          hands_played?: number | null
          id?: string
          is_private?: boolean | null
          max_buy_in?: number
          min_buy_in?: number
          min_raise?: number | null
          name?: string
          password_hash?: string | null
          pot_total?: number | null
          small_blind?: number
          status?: string
          table_size?: number
          time_limit?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      poker_transactions: {
        Row: {
          amount: number
          balance_after: number
          balance_before: number
          created_at: string | null
          description: string | null
          hand_id: string | null
          id: string
          table_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          balance_before: number
          created_at?: string | null
          description?: string | null
          hand_id?: string | null
          id?: string
          table_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          balance_before?: number
          created_at?: string | null
          description?: string | null
          hand_id?: string | null
          id?: string
          table_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poker_transactions_hand_id_fkey"
            columns: ["hand_id"]
            isOneToOne: false
            referencedRelation: "poker_hands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poker_transactions_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "poker_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          access_tier: string | null
          city: string | null
          club_role: string | null
          created_at: string | null
          diamond_multiplier: number | null
          diamonds: number | null
          email: string | null
          email_verified: boolean | null
          full_name: string | null
          id: string
          last_active: string | null
          last_login: string | null
          phone: string | null
          phone_verified: boolean | null
          player_number: number | null
          referred_by: number | null
          skill_tier: string | null
          state: string | null
          streak_count: number | null
          total_xp: number | null
          username: string | null
          xp_total: number | null
        }
        Insert: {
          access_tier?: string | null
          city?: string | null
          club_role?: string | null
          created_at?: string | null
          diamond_multiplier?: number | null
          diamonds?: number | null
          email?: string | null
          email_verified?: boolean | null
          full_name?: string | null
          id?: string
          last_active?: string | null
          last_login?: string | null
          phone?: string | null
          phone_verified?: boolean | null
          player_number?: number | null
          referred_by?: number | null
          skill_tier?: string | null
          state?: string | null
          streak_count?: number | null
          total_xp?: number | null
          username?: string | null
          xp_total?: number | null
        }
        Update: {
          access_tier?: string | null
          city?: string | null
          club_role?: string | null
          created_at?: string | null
          diamond_multiplier?: number | null
          diamonds?: number | null
          email?: string | null
          email_verified?: boolean | null
          full_name?: string | null
          id?: string
          last_active?: string | null
          last_login?: string | null
          phone?: string | null
          phone_verified?: boolean | null
          player_number?: number | null
          referred_by?: number | null
          skill_tier?: string | null
          state?: string | null
          streak_count?: number | null
          total_xp?: number | null
          username?: string | null
          xp_total?: number | null
        }
        Relationships: []
      }
      reward_claims: {
        Row: {
          created_at: string | null
          diamonds_awarded: number
          id: string
          metadata: Json | null
          multiplier: number | null
          reward_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          diamonds_awarded: number
          id?: string
          metadata?: Json | null
          multiplier?: number | null
          reward_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          diamonds_awarded?: number
          id?: string
          metadata?: Json | null
          multiplier?: number | null
          reward_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_claims_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "reward_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_definitions: {
        Row: {
          base_amount: number
          bypasses_cap: boolean | null
          category: string
          cooldown_hours: number | null
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_repeatable: boolean | null
          max_amount: number | null
          name: string
          rarity: string | null
          subcategory: string | null
        }
        Insert: {
          base_amount: number
          bypasses_cap?: boolean | null
          category?: string
          cooldown_hours?: number | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id: string
          is_repeatable?: boolean | null
          max_amount?: number | null
          name: string
          rarity?: string | null
          subcategory?: string | null
        }
        Update: {
          base_amount?: number
          bypasses_cap?: boolean | null
          category?: string
          cooldown_hours?: number | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_repeatable?: boolean | null
          max_amount?: number | null
          name?: string
          rarity?: string | null
          subcategory?: string | null
        }
        Relationships: []
      }
      social_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string | null
          id: string
          is_deleted: boolean | null
          is_flagged: boolean | null
          like_count: number | null
          parent_id: string | null
          post_id: string
          updated_at: string | null
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string | null
          id?: string
          is_deleted?: boolean | null
          is_flagged?: boolean | null
          like_count?: number | null
          parent_id?: string | null
          post_id: string
          updated_at?: string | null
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string | null
          id?: string
          is_deleted?: boolean | null
          is_flagged?: boolean | null
          like_count?: number | null
          parent_id?: string | null
          post_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "social_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      social_connections: {
        Row: {
          created_at: string | null
          follower_id: string
          following_id: string
          id: string
          notify_achievements: boolean | null
          notify_posts: boolean | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          follower_id: string
          following_id: string
          id?: string
          notify_achievements?: boolean | null
          notify_posts?: boolean | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          follower_id?: string
          following_id?: string
          id?: string
          notify_achievements?: boolean | null
          notify_posts?: boolean | null
          status?: string | null
        }
        Relationships: []
      }
      social_conversation_participants: {
        Row: {
          conversation_id: string | null
          id: string
          is_muted: boolean | null
          joined_at: string | null
          last_read_at: string | null
          read_receipts_enabled: boolean | null
          user_id: string | null
        }
        Insert: {
          conversation_id?: string | null
          id?: string
          is_muted?: boolean | null
          joined_at?: string | null
          last_read_at?: string | null
          read_receipts_enabled?: boolean | null
          user_id?: string | null
        }
        Update: {
          conversation_id?: string | null
          id?: string
          is_muted?: boolean | null
          joined_at?: string | null
          last_read_at?: string | null
          read_receipts_enabled?: boolean | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "social_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_conversation_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      social_conversations: {
        Row: {
          created_at: string | null
          group_name: string | null
          id: string
          is_group: boolean | null
          last_message_at: string | null
          last_message_preview: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          group_name?: string | null
          id?: string
          is_group?: boolean | null
          last_message_at?: string | null
          last_message_preview?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          group_name?: string | null
          id?: string
          is_group?: boolean | null
          last_message_at?: string | null
          last_message_preview?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      social_diamond_rewards: {
        Row: {
          created_at: string | null
          diamonds_earned: number
          id: string
          post_id: string
          reaction_count: number | null
          trigger_type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          diamonds_earned: number
          id?: string
          post_id: string
          reaction_count?: number | null
          trigger_type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          diamonds_earned?: number
          id?: string
          post_id?: string
          reaction_count?: number | null
          trigger_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_diamond_rewards_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      social_interactions: {
        Row: {
          created_at: string | null
          id: string
          interaction_type: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          interaction_type: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          interaction_type?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_interactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      social_media: {
        Row: {
          blurhash: string | null
          content_type: string
          created_at: string | null
          duration_seconds: number | null
          file_name: string
          file_size: number
          height: number | null
          id: string
          post_id: string | null
          storage_path: string
          thumbnail_path: string | null
          uploader_id: string
          width: number | null
        }
        Insert: {
          blurhash?: string | null
          content_type: string
          created_at?: string | null
          duration_seconds?: number | null
          file_name: string
          file_size: number
          height?: number | null
          id?: string
          post_id?: string | null
          storage_path: string
          thumbnail_path?: string | null
          uploader_id: string
          width?: number | null
        }
        Update: {
          blurhash?: string | null
          content_type?: string
          created_at?: string | null
          duration_seconds?: number | null
          file_name?: string
          file_size?: number
          height?: number | null
          id?: string
          post_id?: string | null
          storage_path?: string
          thumbnail_path?: string | null
          uploader_id?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "social_media_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      social_message_reads: {
        Row: {
          id: string
          message_id: string | null
          read_at: string | null
          user_id: string | null
        }
        Insert: {
          id?: string
          message_id?: string | null
          read_at?: string | null
          user_id?: string | null
        }
        Update: {
          id?: string
          message_id?: string | null
          read_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_message_reads_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "social_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_message_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      social_messages: {
        Row: {
          content: string
          conversation_id: string | null
          created_at: string | null
          id: string
          is_deleted: boolean | null
          is_edited: boolean | null
          message_type: string | null
          sender_id: string | null
          updated_at: string | null
        }
        Insert: {
          content: string
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          is_deleted?: boolean | null
          is_edited?: boolean | null
          message_type?: string | null
          sender_id?: string | null
          updated_at?: string | null
        }
        Update: {
          content?: string
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          is_deleted?: boolean | null
          is_edited?: boolean | null
          message_type?: string | null
          sender_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "social_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      social_messaging_settings: {
        Row: {
          message_notifications: boolean | null
          online_status_visible: boolean | null
          read_receipts_enabled: boolean | null
          typing_indicators_enabled: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          message_notifications?: boolean | null
          online_status_visible?: boolean | null
          read_receipts_enabled?: boolean | null
          typing_indicators_enabled?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          message_notifications?: boolean | null
          online_status_visible?: boolean | null
          read_receipts_enabled?: boolean | null
          typing_indicators_enabled?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_messaging_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      social_posts: {
        Row: {
          achievement_data: Json | null
          author_id: string
          comment_count: number | null
          content: string
          content_type: string | null
          created_at: string | null
          id: string
          is_deleted: boolean | null
          is_flagged: boolean | null
          is_pinned: boolean | null
          like_count: number | null
          media_urls: Json | null
          search_vector: unknown
          share_count: number | null
          updated_at: string | null
          view_count: number | null
          visibility: string | null
        }
        Insert: {
          achievement_data?: Json | null
          author_id: string
          comment_count?: number | null
          content: string
          content_type?: string | null
          created_at?: string | null
          id?: string
          is_deleted?: boolean | null
          is_flagged?: boolean | null
          is_pinned?: boolean | null
          like_count?: number | null
          media_urls?: Json | null
          search_vector?: unknown
          share_count?: number | null
          updated_at?: string | null
          view_count?: number | null
          visibility?: string | null
        }
        Update: {
          achievement_data?: Json | null
          author_id?: string
          comment_count?: number | null
          content?: string
          content_type?: string | null
          created_at?: string | null
          id?: string
          is_deleted?: boolean | null
          is_flagged?: boolean | null
          is_pinned?: boolean | null
          like_count?: number | null
          media_urls?: Json | null
          search_vector?: unknown
          share_count?: number | null
          updated_at?: string | null
          view_count?: number | null
          visibility?: string | null
        }
        Relationships: []
      }
      social_xp_log: {
        Row: {
          action_type: string
          base_xp: number
          created_at: string | null
          final_xp: number
          id: string
          multiplier: number | null
          source_id: string | null
          streak_days: number | null
          user_id: string
        }
        Insert: {
          action_type: string
          base_xp: number
          created_at?: string | null
          final_xp: number
          id?: string
          multiplier?: number | null
          source_id?: string | null
          streak_days?: number | null
          user_id: string
        }
        Update: {
          action_type?: string
          base_xp?: number
          created_at?: string | null
          final_xp?: number
          id?: string
          multiplier?: number | null
          source_id?: string | null
          streak_days?: number | null
          user_id?: string
        }
        Relationships: []
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      tournament_registrations: {
        Row: {
          finish_rank: number | null
          id: string
          prize_amount: number | null
          registered_at: string | null
          status: string
          tournament_id: string
          user_id: string
        }
        Insert: {
          finish_rank?: number | null
          id?: string
          prize_amount?: number | null
          registered_at?: string | null
          status?: string
          tournament_id: string
          user_id: string
        }
        Update: {
          finish_rank?: number | null
          id?: string
          prize_amount?: number | null
          registered_at?: string | null
          status?: string
          tournament_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_registrations_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          blind_structure: string | null
          buy_in_amount: number
          buy_in_fee: number
          created_at: string | null
          current_players: number | null
          description: string | null
          game_type: string
          guaranteed_prize: number | null
          id: string
          late_reg_mins: number | null
          max_players: number
          name: string
          payout_structure: string | null
          start_time: string
          starting_chips: number | null
          status: string
          updated_at: string | null
          variant: string | null
        }
        Insert: {
          blind_structure?: string | null
          buy_in_amount: number
          buy_in_fee: number
          created_at?: string | null
          current_players?: number | null
          description?: string | null
          game_type?: string
          guaranteed_prize?: number | null
          id?: string
          late_reg_mins?: number | null
          max_players: number
          name: string
          payout_structure?: string | null
          start_time: string
          starting_chips?: number | null
          status?: string
          updated_at?: string | null
          variant?: string | null
        }
        Update: {
          blind_structure?: string | null
          buy_in_amount?: number
          buy_in_fee?: number
          created_at?: string | null
          current_players?: number | null
          description?: string | null
          game_type?: string
          guaranteed_prize?: number | null
          id?: string
          late_reg_mins?: number | null
          max_players?: number
          name?: string
          payout_structure?: string | null
          start_time?: string
          starting_chips?: number | null
          status?: string
          updated_at?: string | null
          variant?: string | null
        }
        Relationships: []
      }
      training_drills: {
        Row: {
          gto_line: Json | null
          id: string
          level_id: number
          scenario_data: Json | null
        }
        Insert: {
          gto_line?: Json | null
          id?: string
          level_id: number
          scenario_data?: Json | null
        }
        Update: {
          gto_line?: Json | null
          id?: string
          level_id?: number
          scenario_data?: Json | null
        }
        Relationships: []
      }
      user_diamond_balance: {
        Row: {
          balance: number
          created_at: string | null
          current_streak: number
          last_claim_date: string | null
          lifetime_earned: number
          lifetime_spent: number
          longest_streak: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string | null
          current_streak?: number
          last_claim_date?: string | null
          lifetime_earned?: number
          lifetime_spent?: number
          longest_streak?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string | null
          current_streak?: number
          last_claim_date?: string | null
          lifetime_earned?: number
          lifetime_spent?: number
          longest_streak?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_dna_profiles: {
        Row: {
          avatar_url: string | null
          current_level: number | null
          diamonds_total: number | null
          dna_metrics: Json | null
          id: string
          is_verified: boolean | null
          storage_used_bytes: number | null
          streak_count: number | null
          tier_id: string | null
          total_xp: number | null
          updated_at: string | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          current_level?: number | null
          diamonds_total?: number | null
          dna_metrics?: Json | null
          id?: string
          is_verified?: boolean | null
          storage_used_bytes?: number | null
          streak_count?: number | null
          tier_id?: string | null
          total_xp?: number | null
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          current_level?: number | null
          diamonds_total?: number | null
          dna_metrics?: Json | null
          id?: string
          is_verified?: boolean | null
          storage_used_bytes?: number | null
          streak_count?: number | null
          tier_id?: string | null
          total_xp?: number | null
          updated_at?: string | null
          username?: string | null
        }
        Relationships: []
      }
      user_mastery: {
        Row: {
          highest_score: number | null
          is_mastered: boolean | null
          level_id: number
          user_id: string
        }
        Insert: {
          highest_score?: number | null
          is_mastered?: boolean | null
          level_id: number
          user_id: string
        }
        Update: {
          highest_score?: number | null
          is_mastered?: boolean | null
          level_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_mastery_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_progress: {
        Row: {
          created_at: string | null
          diamonds: number
          id: string
          last_active_at: string | null
          level: number
          streak: number
          streak_multiplier: number
          updated_at: string | null
          user_id: string
          xp: number
        }
        Insert: {
          created_at?: string | null
          diamonds?: number
          id?: string
          last_active_at?: string | null
          level?: number
          streak?: number
          streak_multiplier?: number
          updated_at?: string | null
          user_id: string
          xp?: number
        }
        Update: {
          created_at?: string | null
          diamonds?: number
          id?: string
          last_active_at?: string | null
          level?: number
          streak?: number
          streak_multiplier?: number
          updated_at?: string | null
          user_id?: string
          xp?: number
        }
        Relationships: []
      }
      user_seen_history: {
        Row: {
          drill_id: string | null
          mastered_at: string | null
          user_id: string | null
        }
        Insert: {
          drill_id?: string | null
          mastered_at?: string | null
          user_id?: string | null
        }
        Update: {
          drill_id?: string | null
          mastered_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_seen_history_drill_id_fkey"
            columns: ["drill_id"]
            isOneToOne: false
            referencedRelation: "training_drills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_seen_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_streaks: {
        Row: {
          current_streak: number
          last_active_date: string
          longest_streak: number
          streak_started_at: string
          user_id: string
        }
        Insert: {
          current_streak?: number
          last_active_date?: string
          longest_streak?: number
          streak_started_at?: string
          user_id: string
        }
        Update: {
          current_streak?: number
          last_active_date?: string
          longest_streak?: number
          streak_started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_streaks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          id: string
          updated_at: string | null
          username: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          updated_at?: string | null
          username: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          updated_at?: string | null
          username?: string
        }
        Relationships: []
      }
      xp_ledger: {
        Row: {
          amount: number
          base_amount: number
          created_at: string
          id: string
          metadata: Json | null
          multiplier: number
          source: string
          user_id: string
        }
        Insert: {
          amount: number
          base_amount: number
          created_at?: string
          id?: string
          metadata?: Json | null
          multiplier?: number
          source: string
          user_id: string
        }
        Update: {
          amount?: number
          base_amount?: number
          created_at?: string
          id?: string
          metadata?: Json | null
          multiplier?: number
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "xp_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      xp_security_alerts: {
        Row: {
          alert_type: string
          attempted_value: number | null
          blocked: boolean | null
          created_at: string
          id: string
          metadata: Json | null
          old_value: number | null
          severity: string | null
          source_silo: string | null
          user_id: string
        }
        Insert: {
          alert_type: string
          attempted_value?: number | null
          blocked?: boolean | null
          created_at?: string
          id?: string
          metadata?: Json | null
          old_value?: number | null
          severity?: string | null
          source_silo?: string | null
          user_id: string
        }
        Update: {
          alert_type?: string
          attempted_value?: number | null
          blocked?: boolean | null
          created_at?: string
          id?: string
          metadata?: Json | null
          old_value?: number | null
          severity?: string | null
          source_silo?: string | null
          user_id?: string
        }
        Relationships: []
      }
      xp_transactions: {
        Row: {
          amount: number
          context: Json | null
          created_at: string | null
          final_amount: number
          id: string
          multiplier_applied: number | null
          source: string
          user_id: string
        }
        Insert: {
          amount: number
          context?: Json | null
          created_at?: string | null
          final_amount: number
          id?: string
          multiplier_applied?: number | null
          source: string
          user_id: string
        }
        Update: {
          amount?: number
          context?: Json | null
          created_at?: string | null
          final_amount?: number
          id?: string
          multiplier_applied?: number | null
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      xp_vault: {
        Row: {
          created_at: string
          deposit_count: number
          last_deposit_amount: number
          last_deposit_at: string
          last_deposit_source: string | null
          user_id: string
          xp_lifetime: number
          xp_total: number
        }
        Insert: {
          created_at?: string
          deposit_count?: number
          last_deposit_amount?: number
          last_deposit_at?: string
          last_deposit_source?: string | null
          user_id: string
          xp_lifetime?: number
          xp_total?: number
        }
        Update: {
          created_at?: string
          deposit_count?: number
          last_deposit_amount?: number
          last_deposit_at?: string
          last_deposit_source?: string | null
          user_id?: string
          xp_lifetime?: number
          xp_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "xp_vault_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
      global_search_index: {
        Row: {
          id: string | null
          searchable_name: string | null
          type: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      claim_reward: {
        Args: { p_metadata?: Json; p_reward_id: string; p_user_id: string }
        Returns: Json
      }
      create_bot_player: {
        Args: { p_display_name?: string; p_username: string }
        Returns: number
      }
      disablelongtransactions: { Args: never; Returns: string }
      dismiss_celebration: {
        Args: { p_celebration_id: string }
        Returns: boolean
      }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      fn_award_social_xp: {
        Args: { p_action_type: string; p_source_id?: string; p_user_id: string }
        Returns: {
          diamonds_awarded: number
          multiplier_applied: number
          streak_days: number
          total_xp: number
          xp_awarded: number
        }[]
      }
      fn_award_xp: {
        Args: {
          p_amount: number
          p_context?: Json
          p_multiplier?: number
          p_source: string
          p_user_id: string
        }
        Returns: string
      }
      fn_calculate_level: { Args: { p_xp: number }; Returns: number }
      fn_complete_media_upload: {
        Args: {
          p_blurhash?: string
          p_height?: number
          p_media_id: string
          p_post_id: string
          p_width?: number
        }
        Returns: boolean
      }
      fn_create_media_upload: {
        Args: {
          p_content_type: string
          p_file_name: string
          p_file_size: number
          p_storage_path: string
          p_uploader_id: string
        }
        Returns: string
      }
      fn_get_available_seats: {
        Args: { p_table_id: string }
        Returns: {
          seat_number: number
        }[]
      }
      fn_get_or_create_conversation: {
        Args: { user1_id: string; user2_id: string }
        Returns: string
      }
      fn_get_social_feed: {
        Args: {
          p_filter?: string
          p_limit?: number
          p_offset?: number
          p_user_id: string
        }
        Returns: {
          author_avatar: string
          author_id: string
          author_level: number
          author_username: string
          comment_count: number
          content: string
          content_type: string
          created_at: string
          is_liked: boolean
          like_count: number
          media_urls: Json
          post_id: string
          share_count: number
        }[]
      }
      fn_get_social_leaderboard: {
        Args: { p_limit?: number; p_timeframe?: string }
        Returns: {
          avatar_url: string
          diamonds_earned: number
          is_verified: boolean
          level: number
          posts_count: number
          rank: number
          reactions_received: number
          tier: string
          user_id: string
          username: string
          xp_earned: number
        }[]
      }
      fn_get_streak_multiplier: {
        Args: { p_streak_days: number }
        Returns: number
      }
      fn_get_user_conversations: {
        Args: { p_user_id: string }
        Returns: {
          conversation_id: string
          is_group: boolean
          last_message_at: string
          other_user_avatar: string
          other_user_id: string
          other_user_username: string
          title: string
          unread_count: number
        }[]
      }
      fn_get_user_xp: { Args: { p_user_id: string }; Returns: number }
      fn_leave_table:
        | { Args: { p_table_id: string }; Returns: Json }
        | { Args: { p_table_id: string; p_user_id: string }; Returns: Json }
      fn_mark_messages_read: {
        Args: { p_conversation_id: string; p_user_id: string }
        Returns: number
      }
      fn_seat_player:
        | {
            Args: {
              p_buy_in_amount: number
              p_seat_number: number
              p_table_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_buy_in_amount: number
              p_seat_number: number
              p_table_id: string
              p_user_id: string
            }
            Returns: Json
          }
      fn_send_message: {
        Args: {
          p_content: string
          p_conversation_id: string
          p_sender_id: string
        }
        Returns: string
      }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      get_next_player_number: { Args: never; Returns: number }
      get_pending_celebrations: { Args: { p_user_id: string }; Returns: Json }
      gettransactionid: { Args: never; Returns: unknown }
      initialize_player_profile: {
        Args: {
          p_city: string
          p_email: string
          p_full_name: string
          p_phone: string
          p_state: string
          p_user_id: string
          p_username: string
        }
        Returns: {
          message: string
          player_number: number
          success: boolean
        }[]
      }
      longtransactionsenabled: { Args: never; Returns: boolean }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      register_for_tournament: {
        Args: { p_tournament_id: string; p_user_id: string }
        Returns: Json
      }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      unlockrows: { Args: { "": string }; Returns: number }
      update_daily_streak: { Args: { p_user_id: string }; Returns: Json }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
    }
    Enums: {
      game_type: "NLHE" | "PLO" | "PLO5" | "cash" | "tournament" | "sit_n_go"
      game_variant:
        | "nlh"
        | "flh"
        | "plo4"
        | "plo5"
        | "plo6"
        | "plo_hilo"
        | "plo8"
        | "short_deck"
        | "ofc"
        | "ofc_pineapple"
      member_role: "owner" | "admin" | "agent" | "member"
      member_status: "active" | "pending" | "suspended" | "banned"
      table_status: "waiting" | "running" | "paused" | "closed"
      transaction_type:
        | "deposit"
        | "withdrawal"
        | "buy_in"
        | "cash_out"
        | "agent_transfer"
        | "rake"
        | "bonus"
        | "refund"
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
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
    Enums: {
      game_type: ["NLHE", "PLO", "PLO5", "cash", "tournament", "sit_n_go"],
      game_variant: [
        "nlh",
        "flh",
        "plo4",
        "plo5",
        "plo6",
        "plo_hilo",
        "plo8",
        "short_deck",
        "ofc",
        "ofc_pineapple",
      ],
      member_role: ["owner", "admin", "agent", "member"],
      member_status: ["active", "pending", "suspended", "banned"],
      table_status: ["waiting", "running", "paused", "closed"],
      transaction_type: [
        "deposit",
        "withdrawal",
        "buy_in",
        "cash_out",
        "agent_transfer",
        "rake",
        "bonus",
        "refund",
      ],
    },
  },
} as const
