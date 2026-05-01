import { useEffect, useState } from "react";
import { supabase } from "./supabase";

/* =========================================================
 * STORE — Supabase-backed, with the same API as the local
 * version so App.jsx and components don't have to change.
 *
 * Exposed API:
 *   useStore()                    → current denormalized state
 *   actions.{addPerson, updatePerson, deletePerson,
 *            addGroup, deleteGroup,
 *            addExpense, deleteExpense,
 *            settleUp,
 *            markNotificationsRead,
 *            resetAll}
 *   auth.{signUp, signIn, signOut}
 *   currentPerson(state) / currentUser(state)
 *   groupBalances / simplifyDebts / userTotalsAcrossGroups /
 *   userGroupNet / fmt / eventIcon / uid
 * ========================================================= */

let _state = {
  session: null,
  profile: null,
  people: [],
  groups: [],
  expenses: [],
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
  const [, setLocal] = useState(0);
  useEffect(() => {
    const sub = () => setLocal((n) => n + 1);
    _subs.add(sub);
    return () => _subs.delete(sub);
  }, []);
  return _state;
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/* ---------- Selectors ---------- */

export function currentUser(state) {
  return state.session?.user ?? null;
}
export function currentPerson(state) {
  return state.people.find((p) => p.isSelf) ?? null;
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
      options: {
        data: { display_name: displayName.trim() },
      },
    });
    if (error) throw error;
    if (!data.session) {
      throw new Error(
        "Account created — check your email to confirm. (Tip: turn off 'Confirm email' in Supabase → Auth settings to skip this for testing.)"
      );
    }
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

/* ---------- Initial load + auth wiring ---------- */

async function loadAll(userId) {
  setState((s) => ({ ...s, loading: true, error: null }));
  try {
    const [profile, people, groups, groupMembers, expenses, expenseSplits, events, notifications] =
      await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
        supabase.from("people").select("*").eq("owner_id", userId).order("created_at", { ascending: true }),
        supabase.from("groups").select("*").eq("owner_id", userId).order("created_at", { ascending: false }),
        supabase.from("group_members").select("*"),
        supabase.from("expenses").select("*").eq("owner_id", userId).order("date", { ascending: false }),
        supabase.from("expense_splits").select("*"),
        supabase.from("events").select("*").eq("owner_id", userId).order("ts", { ascending: false }).limit(500),
        supabase.from("notifications").select("*").eq("owner_id", userId).order("ts", { ascending: false }).limit(200),
      ]);

    const errs = [profile, people, groups, groupMembers, expenses, expenseSplits, events, notifications]
      .map((r) => r.error)
      .filter(Boolean);
    if (errs.length) throw errs[0];

    setState((s) => ({
      ...s,
      profile: profile.data ? mapProfile(profile.data) : null,
      people: (people.data ?? []).map(mapPerson),
      groups: (groups.data ?? []).map((g) => mapGroup(g, groupMembers.data ?? [])),
      expenses: (expenses.data ?? []).map((e) => mapExpense(e, expenseSplits.data ?? [])),
      events: (events.data ?? []).map(mapEvent),
      notifications: (notifications.data ?? []).map(mapNotification),
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
    people: [],
    groups: [],
    expenses: [],
    events: [],
    notifications: [],
    loading: false,
    error: null,
  }));
}

// Initial session check + auth listener
supabase.auth.getSession().then(({ data: { session } }) => {
  setState((s) => ({ ...s, session }));
  if (session?.user) loadAll(session.user.id);
  else setState((s) => ({ ...s, loading: false }));
});

supabase.auth.onAuthStateChange((event, session) => {
  setState((s) => ({ ...s, session }));
  if (session?.user) loadAll(session.user.id);
  else clearData();
});

/* ---------- Mapping helpers (snake_case → camelCase) ---------- */

function mapProfile(row) {
  return { id: row.id, displayName: row.display_name, color: row.color };
}
function mapPerson(row) {
  return { id: row.id, name: row.name, color: row.color, isSelf: row.is_self };
}
function mapGroup(row, members) {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji ?? "👥",
    memberIds: members.filter((m) => m.group_id === row.id).map((m) => m.person_id),
  };
}
function mapExpense(row, splits) {
  return {
    id: row.id,
    groupId: row.group_id,
    description: row.description,
    amount: parseFloat(row.amount),
    paidBy: row.paid_by,
    splitBetween: splits.filter((s) => s.expense_id === row.id).map((s) => s.person_id),
    date: row.date,
    type: row.type,
  };
}
function mapEvent(row) {
  return {
    id: row.id,
    type: row.type,
    label: row.label,
    ts: new Date(row.ts).getTime(),
    actorId: row.actor_id,
    payload: row.payload ?? {},
  };
}
function mapNotification(row) {
  return {
    id: row.id,
    toPersonId: row.to_person_id,
    message: row.message,
    read: row.read,
    ts: new Date(row.ts).getTime(),
    groupId: row.group_id,
  };
}

/* ---------- Internal helpers ---------- */

function userId() {
  return _state.session?.user?.id;
}
async function logEvent(type, label, payload = {}) {
  const uid = userId();
  if (!uid) return;
  await supabase.from("events").insert({
    owner_id: uid,
    type,
    actor_id: uid,
    label,
    payload,
  });
}

const PALETTE = ["#10b981","#3b82f6","#f59e0b","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f97316","#6366f1","#84cc16"];
function nextColor() {
  return PALETTE[_state.people.length % PALETTE.length];
}

function refresh() {
  const uid = userId();
  if (uid) return loadAll(uid);
}

/* ---------- Domain actions ---------- */

export const actions = {
  async addPerson(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (_state.people.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) return;
    const me = currentPerson(_state);
    const { error } = await supabase.from("people").insert({
      owner_id: userId(),
      name: trimmed,
      color: nextColor(),
      is_self: false,
    });
    if (error) return console.error(error);
    await logEvent("person_added", `${me?.name ?? "Someone"} added ${trimmed}`);
    await refresh();
  },

  async updatePerson(id, name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const old = _state.people.find((p) => p.id === id);
    if (!old || old.name === trimmed) return;
    const me = currentPerson(_state);
    const { error } = await supabase.from("people").update({ name: trimmed }).eq("id", id);
    if (error) return console.error(error);
    await logEvent("person_renamed", `${me?.name ?? "Someone"} renamed ${old.name} → ${trimmed}`, { personId: id });
    await refresh();
  },

  async deletePerson(id) {
    const old = _state.people.find((p) => p.id === id);
    if (!old || old.isSelf) return;
    const me = currentPerson(_state);
    const { error } = await supabase.from("people").delete().eq("id", id);
    if (error) return console.error(error);
    await logEvent("person_deleted", `${me?.name ?? "Someone"} removed ${old.name}`, { personId: id });
    await refresh();
  },

  async addGroup(name, memberIds, emoji = "👥") {
    const trimmed = name.trim();
    if (!trimmed || !memberIds?.length) return;
    const me = currentPerson(_state);
    const { data: group, error } = await supabase
      .from("groups")
      .insert({ owner_id: userId(), name: trimmed, emoji })
      .select()
      .single();
    if (error) return console.error(error);

    const rows = memberIds.map((person_id) => ({ group_id: group.id, person_id }));
    const { error: mErr } = await supabase.from("group_members").insert(rows);
    if (mErr) return console.error(mErr);

    await logEvent("group_created", `${me?.name ?? "Someone"} created group "${trimmed}"`, { groupId: group.id });
    await refresh();
  },

  async deleteGroup(id) {
    const old = _state.groups.find((g) => g.id === id);
    if (!old) return;
    const me = currentPerson(_state);
    const { error } = await supabase.from("groups").delete().eq("id", id);
    if (error) return console.error(error);
    await logEvent("group_deleted", `${me?.name ?? "Someone"} deleted group "${old.name}"`, { groupId: id });
    await refresh();
  },

  async addExpense({ groupId, description, amount, paidBy, splitBetween }) {
    const desc = description.trim();
    const amt = Number(amount);
    if (!desc || !(amt > 0) || !splitBetween?.length || !groupId || !paidBy) return;

    const { data: expense, error } = await supabase
      .from("expenses")
      .insert({
        owner_id: userId(),
        group_id: groupId,
        description: desc,
        amount: amt,
        paid_by: paidBy,
        type: "expense",
      })
      .select()
      .single();
    if (error) return console.error(error);

    const splitRows = splitBetween.map((person_id) => ({ expense_id: expense.id, person_id }));
    const { error: sErr } = await supabase.from("expense_splits").insert(splitRows);
    if (sErr) return console.error(sErr);

    const group = _state.groups.find((g) => g.id === groupId);
    const payer = _state.people.find((p) => p.id === paidBy);
    const perHead = amt / splitBetween.length;
    const me = currentPerson(_state);

    const notifRows = splitBetween
      .filter((pid) => pid !== paidBy)
      .map((pid) => ({
        owner_id: userId(),
        to_person_id: pid,
        message: `${payer?.name ?? "Someone"} added "${desc}" in ${group?.name ?? "a group"}. You owe ₹${perHead.toFixed(2)}`,
        group_id: groupId,
      }));
    if (notifRows.length) await supabase.from("notifications").insert(notifRows);

    await logEvent(
      "expense_added",
      `${me?.name ?? payer?.name ?? "Someone"} added "${desc}" (₹${amt}) in ${group?.name ?? "a group"} — split ${splitBetween.length} ways`,
      { expenseId: expense.id, groupId, amount: amt }
    );
    await refresh();
  },

  async deleteExpense(id) {
    const old = _state.expenses.find((e) => e.id === id);
    if (!old) return;
    const me = currentPerson(_state);
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) return console.error(error);
    await logEvent("expense_deleted", `${me?.name ?? "Someone"} deleted "${old.description}" (₹${old.amount})`, { expenseId: id });
    await refresh();
  },

  async settleUp({ groupId, fromId, toId, amount }) {
    const amt = Number(amount);
    if (!(amt > 0) || !fromId || !toId) return;
    const { data: expense, error } = await supabase
      .from("expenses")
      .insert({
        owner_id: userId(),
        group_id: groupId,
        description: "Settlement",
        amount: amt,
        paid_by: fromId,
        type: "settlement",
      })
      .select()
      .single();
    if (error) return console.error(error);

    const { error: sErr } = await supabase
      .from("expense_splits")
      .insert([{ expense_id: expense.id, person_id: toId }]);
    if (sErr) return console.error(sErr);

    const from = _state.people.find((p) => p.id === fromId);
    const to = _state.people.find((p) => p.id === toId);
    const group = _state.groups.find((g) => g.id === groupId);
    const me = currentPerson(_state);

    await supabase.from("notifications").insert({
      owner_id: userId(),
      to_person_id: toId,
      message: `${from?.name ?? "Someone"} paid you ₹${amt.toFixed(2)}`,
      group_id: groupId,
    });

    await logEvent(
      "settlement_added",
      `${me?.name ?? from?.name ?? "Someone"} marked ${from?.name} → ${to?.name} as paid (₹${amt}) in ${group?.name ?? "a group"}`,
      { fromId, toId, amount: amt, groupId }
    );
    await refresh();
  },

  async markNotificationsRead(personId) {
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("owner_id", userId())
      .eq("to_person_id", personId)
      .eq("read", false);
    await refresh();
  },

  async resetAll() {
    const uid = userId();
    if (!uid) return;
    // Delete in dependency order. RLS scopes deletes to this user.
    await supabase.from("expenses").delete().eq("owner_id", uid); // cascades expense_splits
    await supabase.from("groups").delete().eq("owner_id", uid);   // cascades group_members
    await supabase.from("notifications").delete().eq("owner_id", uid);
    await supabase.from("events").delete().eq("owner_id", uid);
    // Keep self-person; delete other contacts
    await supabase.from("people").delete().eq("owner_id", uid).eq("is_self", false);
    await refresh();
  },
};

/* ---------- Balance engine (unchanged) ---------- */

export function groupBalances(state, groupId) {
  const exps = state.expenses.filter((e) => e.groupId === groupId);
  const balances = {};
  for (const e of exps) {
    const share = e.amount / e.splitBetween.length;
    balances[e.paidBy] = (balances[e.paidBy] || 0) + e.amount;
    for (const pid of e.splitBetween) balances[pid] = (balances[pid] || 0) - share;
  }
  return balances;
}

export function simplifyDebts(balances) {
  const creditors = [];
  const debtors = [];
  for (const [id, bal] of Object.entries(balances)) {
    if (bal > 0.01) creditors.push({ id, amt: bal });
    else if (bal < -0.01) debtors.push({ id, amt: -bal });
  }
  creditors.sort((a, b) => b.amt - a.amt);
  debtors.sort((a, b) => b.amt - a.amt);

  const transactions = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amt, creditors[j].amt);
    transactions.push({ from: debtors[i].id, to: creditors[j].id, amount: pay });
    debtors[i].amt -= pay;
    creditors[j].amt -= pay;
    if (debtors[i].amt < 0.01) i++;
    if (creditors[j].amt < 0.01) j++;
  }
  return transactions;
}

export function userTotalsAcrossGroups(state, userId) {
  let owe = 0, owed = 0;
  const perPerson = {};
  for (const g of state.groups) {
    if (!g.memberIds.includes(userId)) continue;
    const txs = simplifyDebts(groupBalances(state, g.id));
    for (const t of txs) {
      if (t.from === userId) {
        owe += t.amount;
        perPerson[t.to] = (perPerson[t.to] || 0) - t.amount;
      } else if (t.to === userId) {
        owed += t.amount;
        perPerson[t.from] = (perPerson[t.from] || 0) + t.amount;
      }
    }
  }
  return { owe, owed, net: owed - owe, perPerson };
}

export function userGroupNet(state, userId, groupId) {
  const txs = simplifyDebts(groupBalances(state, groupId));
  let net = 0;
  for (const t of txs) {
    if (t.from === userId) net -= t.amount;
    else if (t.to === userId) net += t.amount;
  }
  return net;
}

export function fmt(amount) {
  const n = Math.abs(amount);
  return `₹${n.toFixed(2).replace(/\.00$/, "")}`;
}

export function eventIcon(type) {
  switch (type) {
    case "account_created": return "🎉";
    case "signed_in": return "🔓";
    case "signed_out": return "🔒";
    case "person_added": return "👤";
    case "person_renamed": return "✏️";
    case "person_deleted": return "🗑️";
    case "group_created": return "👥";
    case "group_deleted": return "🗑️";
    case "expense_added": return "💸";
    case "expense_deleted": return "🗑️";
    case "settlement_added": return "✅";
    default: return "•";
  }
}
