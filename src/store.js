import { useEffect, useState } from "react";
import { supabase } from "./supabase";

/* =========================================================
 * STORE — hybrid multi-tenant.
 * - Each registered user has a public `profile` (id = auth.uid).
 * - Groups are owned by their creator but shared among members.
 * - A "member" of a group is either:
 *     • a registered user (m.userId set) — can see + edit the group
 *     • a contact (m.userId null) — just a name for split tracking
 * - Expenses/splits reference member IDs (per-group identity).
 * - Notifications and balances aggregate across groups for registered users.
 *
 * Exposed API:
 *   useStore()                            → denormalized state
 *   actions.{ addGroup, deleteGroup,
 *             addRegisteredMember, addContactMember, removeMember,
 *             addExpense, deleteExpense,
 *             settleUp,
 *             updateProfile,
 *             markNotificationsRead,
 *             findUserByEmail }
 *   auth.{ signUp, signIn, signOut }
 *   selectors: currentProfile, myMemberInGroup,
 *              groupBalances, simplifyDebts,
 *              userTotalsAcrossGroups, userGroupNet
 * ========================================================= */

let _state = {
  session: null,
  profile: null,        // own profile {id, email, displayName, color}
  groups: [],           // [{id, name, emoji, createdBy, members: [...]}]
  expenses: [],         // [{id, groupId, description, amount, paidBy, splitBetween, type, date, createdBy}]
  events: [],
  notifications: [],
  loading: true,
  error: null,
};

const _subs = new Set();
function setState(updater) {
  _state = typeof updater === "function" ? updater(_state) : updater;
  _subs.forEach((s) => s(_state));
}

export function useStore() {
  const [, bump] = useState(0);
  useEffect(() => {
    const sub = () => bump((n) => n + 1);
    _subs.add(sub);
    return () => _subs.delete(sub);
  }, []);
  return _state;
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/* ---------- Selectors ---------- */

export function currentProfile(state) {
  return state.profile;
}
export function myMemberInGroup(state, groupId) {
  if (!state.profile) return null;
  const g = state.groups.find((x) => x.id === groupId);
  if (!g) return null;
  return g.members.find((m) => m.userId === state.profile.id) ?? null;
}

/* ---------- Auth ---------- */

export const auth = {
  async signUp({ email, password, displayName }) {
    email = email.trim().toLowerCase();
    if (!email) throw new Error("Email is required");
    if (password.length < 6) throw new Error("Password must be at least 6 characters");
    if (!displayName?.trim()) throw new Error("Display name is required");
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName.trim() } },
    });
    if (error) throw error;
    if (!data.session) throw new Error("Account created — check your email to confirm.");
  },

  async signIn({ email, password }) {
    email = email.trim().toLowerCase();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  },

  async signOut() {
    await supabase.auth.signOut();
  },
};

/* ---------- Loading ---------- */

async function loadAll(userId) {
  setState((s) => ({ ...s, loading: true, error: null }));
  try {
    // Step 1: profile + groups (RLS filters to groups I'm a member of)
    const [profileRes, groupsRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("groups").select("*").order("created_at", { ascending: false }),
    ]);
    if (profileRes.error) throw profileRes.error;
    if (groupsRes.error) throw groupsRes.error;

    const groupRows = groupsRes.data ?? [];
    const groupIds = groupRows.map((g) => g.id);

    // Step 2: members + expenses + splits + events for visible groups
    const [membersRes, expensesRes, splitsRes, eventsRes, notifRes] = await Promise.all([
      groupIds.length
        ? supabase.from("group_members").select("*").in("group_id", groupIds)
        : Promise.resolve({ data: [], error: null }),
      groupIds.length
        ? supabase.from("expenses").select("*").in("group_id", groupIds).order("date", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      Promise.resolve({ data: [], error: null }), // filled below after expense IDs known
      groupIds.length
        ? supabase.from("events").select("*").in("group_id", groupIds).order("ts", { ascending: false }).limit(500)
        : Promise.resolve({ data: [], error: null }),
      supabase.from("notifications").select("*").eq("user_id", userId).order("ts", { ascending: false }).limit(200),
    ]);
    if (membersRes.error) throw membersRes.error;
    if (expensesRes.error) throw expensesRes.error;
    if (eventsRes.error) throw eventsRes.error;
    if (notifRes.error) throw notifRes.error;

    const expenseIds = (expensesRes.data ?? []).map((e) => e.id);
    const splitsLoad = expenseIds.length
      ? await supabase.from("expense_splits").select("*").in("expense_id", expenseIds)
      : { data: [], error: null };
    if (splitsLoad.error) throw splitsLoad.error;

    setState((s) => ({
      ...s,
      profile: profileRes.data ? mapProfile(profileRes.data) : null,
      groups: groupRows.map((g) => mapGroup(g, membersRes.data ?? [])),
      expenses: (expensesRes.data ?? []).map((e) => mapExpense(e, splitsLoad.data ?? [])),
      events: (eventsRes.data ?? []).map(mapEvent),
      notifications: (notifRes.data ?? []).map(mapNotification),
      loading: false,
      error: null,
    }));
  } catch (err) {
    console.error("[store] load failed", err);
    setState((s) => ({ ...s, loading: false, error: err.message ?? String(err) }));
  }
}

function clearData() {
  setState((s) => ({
    ...s,
    profile: null,
    groups: [],
    expenses: [],
    events: [],
    notifications: [],
    loading: false,
    error: null,
  }));
}

supabase.auth.getSession().then(({ data: { session } }) => {
  setState((s) => ({ ...s, session }));
  if (session?.user) loadAll(session.user.id);
  else setState((s) => ({ ...s, loading: false }));
});

supabase.auth.onAuthStateChange((_event, session) => {
  setState((s) => ({ ...s, session }));
  if (session?.user) loadAll(session.user.id);
  else clearData();
});

/* ---------- Mapping ---------- */

function mapProfile(r) {
  return { id: r.id, email: r.email, displayName: r.display_name, color: r.color };
}
function mapMember(r) {
  return {
    id: r.id,
    groupId: r.group_id,
    userId: r.user_id,         // null for contacts
    displayName: r.display_name,
    color: r.color,
    addedBy: r.added_by,
  };
}
function mapGroup(r, members) {
  return {
    id: r.id,
    name: r.name,
    emoji: r.emoji ?? "👥",
    createdBy: r.created_by,
    members: members.filter((m) => m.group_id === r.id).map(mapMember),
  };
}
function mapExpense(r, splits) {
  return {
    id: r.id,
    groupId: r.group_id,
    description: r.description,
    amount: parseFloat(r.amount),
    paidBy: r.paid_by_member_id,
    splitBetween: splits.filter((s) => s.expense_id === r.id).map((s) => s.member_id),
    type: r.type,
    createdBy: r.created_by,
    date: r.date,
  };
}
function mapEvent(r) {
  return {
    id: r.id,
    groupId: r.group_id,
    type: r.type,
    label: r.label,
    actorId: r.actor_id,
    payload: r.payload ?? {},
    ts: new Date(r.ts).getTime(),
  };
}
function mapNotification(r) {
  return {
    id: r.id,
    userId: r.user_id,
    message: r.message,
    read: r.read,
    groupId: r.group_id,
    ts: new Date(r.ts).getTime(),
  };
}

/* ---------- Helpers ---------- */

function userId() {
  return _state.session?.user?.id;
}
async function logEvent(groupId, type, label, payload = {}) {
  const uidv = userId();
  if (!uidv) return;
  await supabase.from("events").insert({
    group_id: groupId,
    type,
    actor_id: uidv,
    label,
    payload,
  });
}
async function refresh() {
  const u = userId();
  if (u) await loadAll(u);
}

const PALETTE = ["#10b981","#3b82f6","#f59e0b","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f97316","#6366f1","#84cc16"];
function pickColor(seed = 0) {
  return PALETTE[seed % PALETTE.length];
}

/* ---------- Domain actions ---------- */

export const actions = {
  /* ----- Profile ----- */
  async updateProfile({ displayName, color }) {
    const u = userId();
    if (!u) return;
    const patch = {};
    if (displayName !== undefined) patch.display_name = displayName.trim();
    if (color !== undefined) patch.color = color;
    if (Object.keys(patch).length === 0) return;
    const { error } = await supabase.from("profiles").update(patch).eq("id", u);
    if (error) return console.error(error);
    await refresh();
  },

  /* ----- Member picker support ----- */
  // Returns the matching profile or null. Exact email match only.
  async findUserByEmail(email) {
    const e = email.trim().toLowerCase();
    if (!e) return null;
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .ilike("email", e)
      .maybeSingle();
    if (error) {
      console.error(error);
      return null;
    }
    return data ? mapProfile(data) : null;
  },

  // Returns all profiles (used to populate the member-picker dropdown).
  async listProfiles() {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("display_name", { ascending: true });
    if (error) {
      console.error(error);
      return [];
    }
    return (data ?? []).map(mapProfile);
  },

  /* ----- Groups ----- */
  async addGroup(name, emoji = "👥") {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const u = userId();
    if (!u) return null;
    const me = _state.profile;

    // 1. Create group
    const { data: group, error } = await supabase
      .from("groups")
      .insert({ name: trimmed, emoji, created_by: u })
      .select()
      .single();
    if (error) {
      console.error(error);
      return null;
    }

    // 2. Add self as the first member (so RLS sees us as a member)
    const { error: mErr } = await supabase.from("group_members").insert({
      group_id: group.id,
      user_id: u,
      display_name: me?.displayName ?? "Me",
      color: me?.color ?? "#10b981",
      added_by: u,
    });
    if (mErr) console.error(mErr);

    await logEvent(group.id, "group_created", `${me?.displayName ?? "Someone"} created group "${trimmed}"`);
    await refresh();
    return group.id;
  },

  async updateGroup(id, { name, emoji }) {
    const old = _state.groups.find((g) => g.id === id);
    if (!old) return;
    const patch = {};
    if (name !== undefined && name.trim() && name.trim() !== old.name) patch.name = name.trim();
    if (emoji !== undefined && emoji !== old.emoji) patch.emoji = emoji;
    if (Object.keys(patch).length === 0) return;
    const { error } = await supabase.from("groups").update(patch).eq("id", id);
    if (error) return console.error(error);
    const me = _state.profile;
    const labelParts = [];
    if (patch.name) labelParts.push(`renamed "${old.name}" → "${patch.name}"`);
    if (patch.emoji) labelParts.push(`changed icon`);
    await logEvent(id, "group_updated",
      `${me?.displayName ?? "Someone"} ${labelParts.join(" + ")}`);
    await refresh();
  },

  async deleteGroup(id) {
    const old = _state.groups.find((g) => g.id === id);
    if (!old) return;
    const me = _state.profile;
    const { error } = await supabase.from("groups").delete().eq("id", id);
    if (error) return console.error(error);
    // Group is gone — log a personal event (group_id null) so it shows up somewhere
    await logEvent(null, "group_deleted", `${me?.displayName ?? "Someone"} deleted group "${old.name}"`);
    await refresh();
  },

  /* ----- Members ----- */
  async addRegisteredMember(groupId, userIdToAdd, profile) {
    const u = userId();
    const me = _state.profile;
    const { error } = await supabase.from("group_members").insert({
      group_id: groupId,
      user_id: userIdToAdd,
      display_name: profile.displayName,
      color: profile.color,
      added_by: u,
    });
    if (error) {
      if (error.code === "23505") throw new Error(`${profile.displayName} is already in this group`);
      throw error;
    }
    const group = _state.groups.find((g) => g.id === groupId);
    await logEvent(groupId, "member_added",
      `${me?.displayName ?? "Someone"} added ${profile.displayName} to ${group?.name ?? "the group"}`);
    // Notify the added user
    await supabase.from("notifications").insert({
      user_id: userIdToAdd,
      message: `${me?.displayName ?? "Someone"} added you to "${group?.name ?? "a group"}"`,
      group_id: groupId,
    });
    await refresh();
  },

  // Bulk add — used when picking multiple users from the dropdown.
  async addRegisteredMembers(groupId, profiles) {
    if (!profiles?.length) return;
    const u = userId();
    const me = _state.profile;
    const rows = profiles.map((p) => ({
      group_id: groupId,
      user_id: p.id,
      display_name: p.displayName,
      color: p.color,
      added_by: u,
    }));
    const { error } = await supabase.from("group_members").insert(rows);
    if (error) {
      // Postgres unique-violation if any user already in group; skip with warning
      if (error.code !== "23505") {
        console.error(error);
        throw error;
      }
    }
    const group = _state.groups.find((g) => g.id === groupId);
    const names = profiles.map((p) => p.displayName).join(", ");
    await logEvent(groupId, "member_added",
      `${me?.displayName ?? "Someone"} added ${names} to ${group?.name ?? "the group"}`);
    // Notify each added user
    const notifRows = profiles.map((p) => ({
      user_id: p.id,
      message: `${me?.displayName ?? "Someone"} added you to "${group?.name ?? "a group"}"`,
      group_id: groupId,
    }));
    if (notifRows.length) await supabase.from("notifications").insert(notifRows);
    await refresh();
  },

  async updateMember(memberId, { displayName, color }) {
    let memberDescriptor = null;
    let groupId = null;
    for (const g of _state.groups) {
      const m = g.members.find((x) => x.id === memberId);
      if (m) { memberDescriptor = m; groupId = g.id; break; }
    }
    if (!memberDescriptor) return;
    const patch = {};
    if (displayName !== undefined && displayName.trim() && displayName.trim() !== memberDescriptor.displayName) {
      patch.display_name = displayName.trim();
    }
    if (color !== undefined && color !== memberDescriptor.color) patch.color = color;
    if (Object.keys(patch).length === 0) return;
    const { error } = await supabase.from("group_members").update(patch).eq("id", memberId);
    if (error) return console.error(error);
    const me = _state.profile;
    if (patch.display_name) {
      await logEvent(groupId, "member_renamed",
        `${me?.displayName ?? "Someone"} renamed ${memberDescriptor.displayName} → ${patch.display_name}`);
    }
    await refresh();
  },

  async addContactMember(groupId, name) {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Name is required");
    const u = userId();
    const me = _state.profile;
    const group = _state.groups.find((g) => g.id === groupId);
    const seed = (group?.members?.length ?? 0) + 1;
    const { error } = await supabase.from("group_members").insert({
      group_id: groupId,
      user_id: null,
      display_name: trimmed,
      color: pickColor(seed),
      added_by: u,
    });
    if (error) throw error;
    await logEvent(groupId, "member_added",
      `${me?.displayName ?? "Someone"} added contact "${trimmed}" to ${group?.name ?? "the group"}`);
    await refresh();
  },

  async removeMember(memberId) {
    const me = _state.profile;
    let memberDescriptor = null;
    let groupId = null;
    for (const g of _state.groups) {
      const m = g.members.find((x) => x.id === memberId);
      if (m) { memberDescriptor = m; groupId = g.id; break; }
    }
    if (!memberDescriptor) return;
    const { error } = await supabase.from("group_members").delete().eq("id", memberId);
    if (error) return console.error(error);
    await logEvent(groupId, "member_removed",
      `${me?.displayName ?? "Someone"} removed ${memberDescriptor.displayName} from the group`);
    await refresh();
  },

  /* ----- Expenses ----- */
  async addExpense({ groupId, description, amount, paidBy, splitBetween }) {
    const desc = description.trim();
    const amt = Number(amount);
    if (!desc || !(amt > 0) || !splitBetween?.length || !groupId || !paidBy) return;
    const u = userId();

    const { data: expense, error } = await supabase
      .from("expenses")
      .insert({
        group_id: groupId,
        description: desc,
        amount: amt,
        paid_by_member_id: paidBy,
        type: "expense",
        created_by: u,
      })
      .select()
      .single();
    if (error) return console.error(error);

    const splitRows = splitBetween.map((member_id) => ({ expense_id: expense.id, member_id }));
    const { error: sErr } = await supabase.from("expense_splits").insert(splitRows);
    if (sErr) console.error(sErr);

    const group = _state.groups.find((g) => g.id === groupId);
    const payer = group?.members.find((m) => m.id === paidBy);
    const me = _state.profile;
    const perHead = amt / splitBetween.length;

    // Notify each registered member who's in splitBetween (excluding payer)
    const notifRows = splitBetween
      .map((mid) => group?.members.find((m) => m.id === mid))
      .filter((m) => m && m.userId && m.id !== paidBy)
      .map((m) => ({
        user_id: m.userId,
        message: `${payer?.displayName ?? "Someone"} added "${desc}" in ${group?.name ?? "a group"}. Your share: ₹${perHead.toFixed(2)}`,
        group_id: groupId,
      }));
    if (notifRows.length) await supabase.from("notifications").insert(notifRows);

    await logEvent(
      groupId,
      "expense_added",
      `${me?.displayName ?? payer?.displayName ?? "Someone"} added "${desc}" (₹${amt}) — split ${splitBetween.length} ways`,
      { expenseId: expense.id, amount: amt }
    );
    await refresh();
  },

  async deleteExpense(id) {
    const old = _state.expenses.find((e) => e.id === id);
    if (!old) return;
    const me = _state.profile;
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) return console.error(error);
    await logEvent(old.groupId, "expense_deleted",
      `${me?.displayName ?? "Someone"} deleted "${old.description}" (₹${old.amount})`);
    await refresh();
  },

  async settleUp({ groupId, fromId, toId, amount }) {
    const amt = Number(amount);
    if (!(amt > 0) || !fromId || !toId) return;
    const u = userId();

    const { data: settlement, error } = await supabase
      .from("expenses")
      .insert({
        group_id: groupId,
        description: "Settlement",
        amount: amt,
        paid_by_member_id: fromId,
        type: "settlement",
        created_by: u,
      })
      .select()
      .single();
    if (error) return console.error(error);

    const { error: sErr } = await supabase
      .from("expense_splits")
      .insert([{ expense_id: settlement.id, member_id: toId }]);
    if (sErr) console.error(sErr);

    const group = _state.groups.find((g) => g.id === groupId);
    const from = group?.members.find((m) => m.id === fromId);
    const to = group?.members.find((m) => m.id === toId);
    const me = _state.profile;

    if (to?.userId) {
      await supabase.from("notifications").insert({
        user_id: to.userId,
        message: `${from?.displayName ?? "Someone"} marked ₹${amt.toFixed(2)} as paid to you in "${group?.name ?? "a group"}"`,
        group_id: groupId,
      });
    }

    await logEvent(
      groupId,
      "settlement_added",
      `${me?.displayName ?? from?.displayName ?? "Someone"} marked ${from?.displayName} → ${to?.displayName} as paid (₹${amt})`
    );
    await refresh();
  },

  async markNotificationsRead() {
    const u = userId();
    if (!u) return;
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", u)
      .eq("read", false);
    await refresh();
  },
};

/* ---------- Balance engine (member-id space) ---------- */

// {memberId: balance}; positive = is owed, negative = owes
export function groupBalances(state, groupId) {
  const exps = state.expenses.filter((e) => e.groupId === groupId);
  const balances = {};
  for (const e of exps) {
    if (!e.splitBetween.length) continue;
    const share = e.amount / e.splitBetween.length;
    balances[e.paidBy] = (balances[e.paidBy] || 0) + e.amount;
    for (const mid of e.splitBetween) balances[mid] = (balances[mid] || 0) - share;
  }
  return balances;
}

export function simplifyDebts(balances) {
  const creditors = [], debtors = [];
  for (const [id, bal] of Object.entries(balances)) {
    if (bal > 0.01) creditors.push({ id, amt: bal });
    else if (bal < -0.01) debtors.push({ id, amt: -bal });
  }
  creditors.sort((a, b) => b.amt - a.amt);
  debtors.sort((a, b) => b.amt - a.amt);
  const tx = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amt, creditors[j].amt);
    tx.push({ from: debtors[i].id, to: creditors[j].id, amount: pay });
    debtors[i].amt -= pay;
    creditors[j].amt -= pay;
    if (debtors[i].amt < 0.01) i++;
    if (creditors[j].amt < 0.01) j++;
  }
  return tx;
}

// Per-group net for the current user (positive = is owed, negative = owes)
export function userGroupNet(state, userId, groupId) {
  const g = state.groups.find((x) => x.id === groupId);
  if (!g) return 0;
  const myMember = g.members.find((m) => m.userId === userId);
  if (!myMember) return 0;
  const txs = simplifyDebts(groupBalances(state, groupId));
  let net = 0;
  for (const t of txs) {
    if (t.from === myMember.id) net -= t.amount;
    else if (t.to === myMember.id) net += t.amount;
  }
  return net;
}

// Aggregates across all groups for the current user.
// `perPerson` is keyed by either userId (registered member) or contact key
// (= `c:${groupId}:${memberId}`). For the Home view we only show registered users
// in the per-person breakdown so they aggregate naturally; contacts stay per-group.
export function userTotalsAcrossGroups(state, userId) {
  let owe = 0, owed = 0;
  const perUser = {}; // userId -> {amount, displayName, color}
  for (const g of state.groups) {
    const myMember = g.members.find((m) => m.userId === userId);
    if (!myMember) continue;
    const txs = simplifyDebts(groupBalances(state, g.id));
    for (const t of txs) {
      const otherId = t.from === myMember.id ? t.to : t.to === myMember.id ? t.from : null;
      if (!otherId) continue;
      const other = g.members.find((m) => m.id === otherId);
      if (t.from === myMember.id) {
        owe += t.amount;
        if (other?.userId) {
          perUser[other.userId] ??= { amount: 0, displayName: other.displayName, color: other.color };
          perUser[other.userId].amount -= t.amount;
        }
      } else {
        owed += t.amount;
        if (other?.userId) {
          perUser[other.userId] ??= { amount: 0, displayName: other.displayName, color: other.color };
          perUser[other.userId].amount += t.amount;
        }
      }
    }
  }
  return { owe, owed, net: owed - owe, perUser };
}

export function fmt(amount) {
  const n = Math.abs(amount);
  return `₹${n.toFixed(2).replace(/\.00$/, "")}`;
}

export function eventIcon(type) {
  switch (type) {
    case "group_created":     return "👥";
    case "group_updated":     return "✏️";
    case "group_deleted":     return "🗑️";
    case "member_added":      return "➕";
    case "member_removed":    return "➖";
    case "member_renamed":    return "✏️";
    case "expense_added":     return "💸";
    case "expense_deleted":   return "🗑️";
    case "settlement_added":  return "✅";
    default:                  return "•";
  }
}
