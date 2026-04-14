+-- ──────────────────────────────────────────────────────────────────────
+-- Sprint 8  –  Migration #011 (FK follow-up for 010)
+-- Adds referential integrity that 010_sprint8.sql missed
+-- ──────────────────────────────────────────────────────────────────────
+
+-- ── lead_lists.user_id -> auth.users(id) ─────────────────────────────
+ALTER TABLE lead_lists
+  ADD CONSTRAINT fk_lead_lists_user
+  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
+
+-- ── saved_filters.user_id -> auth.users(id) ──────────────────────────
+ALTER TABLE saved_filters
+  ADD CONSTRAINT fk_saved_filters_user
+  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
+
+-- ── search_history.user_id -> auth.users(id) ─────────────────────────
+ALTER TABLE search_history
+  ADD CONSTRAINT fk_search_history_user
+  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
+
+-- ── leads.list_id -> lead_lists(id) ──────────────────────────────────
+ALTER TABLE leads
+  ADD CONSTRAINT fk_leads_list
+  FOREIGN KEY (list_id) REFERENCES lead_lists(id) ON DELETE SET NULL;