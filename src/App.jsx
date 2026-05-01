import { useState, useMemo, useEffect } from "react";
import {
  useStore,
  actions,
  auth,
  currentPerson,
  groupBalances,
  simplifyDebts,
  userTotalsAcrossGroups,
  userGroupNet,
  fmt,
  eventIcon,
} from "./store";
import { Avatar, Card, Button, Modal, Field, Input, EmptyState, Badge } from "./components";
import { LoginScreen } from "./auth";

export default function App() {
  const state = useStore();
  const me = currentPerson(state);
  const [view, setView] = useState({ name: "home" });

  // Initial auth resolution
  if (state.loading && !state.session) {
    return <SplashLoader label="Loading…" />;
  }
  if (!state.session) return <LoginScreen />;
  // Signed in, but profile/people not loaded yet (or failed)
  if (!me) {
    if (state.error) return <SetupError message={state.error} />;
    return <SplashLoader label="Setting up your account…" />;
  }

  const unread = state.notifications.filter((n) => n.toPersonId === me.id && !n.read).length;

  return (
    <div className="min-h-full max-w-md mx-auto pb-24 relative">
      <Header me={me} unread={unread} onNotifClick={() => setView({ name: "notifs" })} />

      <main className="px-4 pt-2">
        {view.name === "home" && (
          <Home
            state={state}
            me={me}
            onOpenGroup={(id) => setView({ name: "group", id })}
            onGoGroups={() => setView({ name: "groups" })}
          />
        )}
        {view.name === "groups" && (
          <Groups state={state} me={me} onOpenGroup={(id) => setView({ name: "group", id })} />
        )}
        {view.name === "group" && (
          <GroupDetail
            state={state}
            groupId={view.id}
            me={me}
            onBack={() => setView({ name: "groups" })}
          />
        )}
        {view.name === "people" && <People state={state} me={me} />}
        {view.name === "history" && <History state={state} />}
        {view.name === "notifs" && (
          <Notifications
            state={state}
            me={me}
            onBack={() => setView({ name: "home" })}
            onOpenGroup={(id) => setView({ name: "group", id })}
          />
        )}
      </main>

      <BottomNav view={view} setView={setView} />
    </div>
  );
}

/* ---------------- Header ---------------- */

function Header({ me, unread, onNotifClick }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 bg-cream/85 backdrop-blur-sm">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent-600 flex items-center justify-center text-white font-bold">S</div>
          <div className="font-bold text-lg">Splitly</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onNotifClick} className="relative p-2 rounded-full hover:bg-slate-100" aria-label="Notifications">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
            {unread > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                {unread}
              </span>
            )}
          </button>
          <div className="relative">
            <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 px-2 py-1.5 rounded-full hover:bg-slate-100">
              <Avatar person={me} size={28} />
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
            </button>
            {open && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-xl shadow-soft border border-slate-100 py-1 z-20 anim-slide">
                  <div className="px-3 py-2 flex items-center gap-2 border-b border-slate-100">
                    <Avatar person={me} size={32} />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{me.name}</div>
                      <div className="text-xs text-slate-400">signed in</div>
                    </div>
                  </div>
                  <button
                    onClick={() => { setOpen(false); auth.signOut(); }}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50 flex items-center gap-2 text-red-600"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

/* ---------------- Home ---------------- */

function Home({ state, me, onOpenGroup, onGoGroups }) {
  const totals = useMemo(() => userTotalsAcrossGroups(state, me.id), [state, me.id]);

  return (
    <div className="space-y-4">
      <div className="pt-2">
        <div className="text-sm text-slate-500">Hi, {me.name.split(" ")[0]}</div>
        <h1 className="text-2xl font-bold tracking-tight">Your balance</h1>
      </div>

      <Card className="p-5">
        <div className="text-sm text-slate-500 mb-1">Net balance</div>
        <div className={`text-3xl font-bold ${totals.net >= 0 ? "text-accent-600" : "text-red-500"}`}>
          {totals.net >= 0 ? "+" : "-"}{fmt(totals.net)}
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="bg-accent-50 rounded-xl p-3">
            <div className="text-xs text-accent-700 font-semibold uppercase tracking-wide">You're owed</div>
            <div className="text-lg font-bold text-accent-700 mt-0.5">{fmt(totals.owed)}</div>
          </div>
          <div className="bg-red-50 rounded-xl p-3">
            <div className="text-xs text-red-700 font-semibold uppercase tracking-wide">You owe</div>
            <div className="text-lg font-bold text-red-600 mt-0.5">{fmt(totals.owe)}</div>
          </div>
        </div>
      </Card>

      {Object.keys(totals.perPerson).length > 0 && (
        <div>
          <div className="text-sm font-semibold text-slate-600 mb-2 px-1">Per person</div>
          <Card className="divide-y divide-slate-100">
            {Object.entries(totals.perPerson).map(([pid, amt]) => {
              const p = state.people.find((x) => x.id === pid);
              if (!p) return null;
              return (
                <div key={pid} className="flex items-center gap-3 p-3">
                  <Avatar person={p} size={36} />
                  <div className="flex-1">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-slate-500">{amt > 0 ? "owes you" : "you owe"}</div>
                  </div>
                  <div className={`font-bold ${amt > 0 ? "text-accent-600" : "text-red-500"}`}>{fmt(amt)}</div>
                </div>
              );
            })}
          </Card>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="text-sm font-semibold text-slate-600">Your groups</div>
          <button onClick={onGoGroups} className="text-xs text-accent-600 font-semibold">See all</button>
        </div>
        <div className="space-y-2">
          {state.groups.filter((g) => g.memberIds.includes(me.id)).slice(0, 4).map((g) => (
            <GroupRow key={g.id} state={state} me={me} group={g} onClick={() => onOpenGroup(g.id)} />
          ))}
          {state.groups.filter((g) => g.memberIds.includes(me.id)).length === 0 && (
            <EmptyState icon="👥" title="No groups yet" subtitle="Create your first group to start splitting." />
          )}
        </div>
      </div>
    </div>
  );
}

function GroupRow({ state, me, group, onClick }) {
  const net = userGroupNet(state, me.id, group.id);
  return (
    <Card className="p-4 flex items-center gap-3" onClick={onClick}>
      <div className="w-10 h-10 rounded-xl bg-accent-50 text-xl flex items-center justify-center shrink-0">{group.emoji ?? "👥"}</div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold truncate">{group.name}</div>
        <div className="text-xs text-slate-500">{group.memberIds.length} members</div>
      </div>
      <div className="text-right">
        {Math.abs(net) < 0.01 ? (
          <Badge>settled</Badge>
        ) : (
          <>
            <div className={`text-sm font-bold ${net >= 0 ? "text-accent-600" : "text-red-500"}`}>{fmt(net)}</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wide">{net >= 0 ? "you're owed" : "you owe"}</div>
          </>
        )}
      </div>
    </Card>
  );
}

/* ---------------- Groups ---------------- */

function Groups({ state, me, onOpenGroup }) {
  const [showAdd, setShowAdd] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-2xl font-bold tracking-tight">Groups</h1>
        <Button onClick={() => setShowAdd(true)}>+ New</Button>
      </div>
      {state.groups.length === 0 ? (
        <EmptyState
          icon="👥"
          title="No groups"
          subtitle="Create a group to start splitting expenses."
          action={<Button onClick={() => setShowAdd(true)}>Create group</Button>}
        />
      ) : (
        <div className="space-y-2">
          {state.groups.map((g) => (
            <GroupRow key={g.id} state={state} me={me} group={g} onClick={() => onOpenGroup(g.id)} />
          ))}
        </div>
      )}
      <AddGroupModal open={showAdd} onClose={() => setShowAdd(false)} state={state} me={me} />
    </div>
  );
}

function AddGroupModal({ open, onClose, state, me }) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("👥");
  const [memberIds, setMemberIds] = useState([]);
  const [error, setError] = useState("");

  // Reset form to defaults when modal opens
  useEffect(() => {
    if (open) {
      setName("");
      setEmoji("👥");
      setMemberIds(state.people.map((p) => p.id));
      setError("");
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return setError("Group name is required");
    if (memberIds.length < 2) return setError("Pick at least 2 members");
    if (!memberIds.includes(me.id)) return setError("You should be a member of the group");
    actions.addGroup(name, memberIds, emoji);
    onClose();
  };

  const toggle = (id) =>
    setMemberIds((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));

  return (
    <Modal open={open} onClose={onClose} title="New group">
      <form onSubmit={submit}>
        <Field label="Group name">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Goa Trip" />
        </Field>
        <Field label="Icon">
          <div className="flex flex-wrap gap-2">
            {["👥","🏖️","🏠","✈️","🍕","🎬","🎉","🚗","🏔️","🛒"].map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => setEmoji(em)}
                className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center ${emoji === em ? "bg-accent-50 ring-2 ring-accent-500" : "bg-slate-100 hover:bg-slate-200"}`}
              >{em}</button>
            ))}
          </div>
        </Field>
        <Field label={`Members (${memberIds.length} selected)`}>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {state.people.map((p) => (
              <label key={p.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={memberIds.includes(p.id)}
                  onChange={() => toggle(p.id)}
                  className="w-4 h-4 accent-accent-600"
                />
                <Avatar person={p} size={28} />
                <span className="text-sm">{p.name}{p.id === me.id ? " (you)" : ""}</span>
              </label>
            ))}
            {state.people.length < 2 && (
              <div className="text-xs text-slate-500 p-2">Add more people on the People tab first.</div>
            )}
          </div>
        </Field>
        {error && <div className="text-sm text-red-600 mb-3">{error}</div>}
        <Button type="submit" className="w-full mt-2">Create group</Button>
      </form>
    </Modal>
  );
}

/* ---------------- Group Detail ---------------- */

function GroupDetail({ state, groupId, me, onBack }) {
  const group = state.groups.find((g) => g.id === groupId);
  const [showAdd, setShowAdd] = useState(false);
  const [showSettle, setShowSettle] = useState(false);

  const expenses = useMemo(
    () => (group ? state.expenses.filter((e) => e.groupId === groupId) : []),
    [state.expenses, groupId, group]
  );
  const balances = useMemo(() => (group ? groupBalances(state, groupId) : {}), [state, groupId, group]);
  const settlements = useMemo(() => simplifyDebts(balances), [balances]);

  if (!group) {
    return (
      <div className="pt-4">
        <button onClick={onBack} className="text-sm text-accent-600 mb-3">← Back</button>
        <EmptyState icon="🤔" title="Group not found" />
      </div>
    );
  }

  const myNet = balances[me.id] ?? 0;

  return (
    <div className="space-y-4">
      <div className="pt-2">
        <button onClick={onBack} className="text-sm text-slate-500 hover:text-ink mb-2 inline-flex items-center gap-1">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          Back
        </button>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-accent-50 text-2xl flex items-center justify-center">{group.emoji ?? "👥"}</div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold truncate">{group.name}</h1>
            <div className="text-xs text-slate-500">{group.memberIds.length} members · {expenses.length} entries</div>
          </div>
          <button
            onClick={() => { if (confirm(`Delete group "${group.name}"?`)) { actions.deleteGroup(groupId); onBack(); } }}
            className="p-2 text-slate-400 hover:text-red-500" aria-label="Delete"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
        </div>
      </div>

      <Card className="p-4">
        <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Your balance here</div>
        <div className={`text-2xl font-bold ${myNet >= 0 ? "text-accent-600" : "text-red-500"}`}>
          {myNet >= 0 ? "+" : "-"}{fmt(myNet)}
        </div>
        <div className="flex gap-2 mt-3">
          <Button onClick={() => setShowAdd(true)} className="flex-1">+ Add expense</Button>
          <Button variant="ghost" onClick={() => setShowSettle(true)} disabled={settlements.length === 0}>Settle up</Button>
        </div>
      </Card>

      {settlements.length > 0 && (
        <div>
          <div className="text-sm font-semibold text-slate-600 mb-2 px-1">Who owes whom</div>
          <Card className="divide-y divide-slate-100">
            {settlements.map((t, i) => {
              const from = state.people.find((p) => p.id === t.from);
              const to = state.people.find((p) => p.id === t.to);
              return (
                <div key={i} className="p-3 flex items-center gap-2 text-sm">
                  <Avatar person={from} size={28} />
                  <span className="font-medium">{from?.name}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
                  <Avatar person={to} size={28} />
                  <span className="font-medium">{to?.name}</span>
                  <span className="ml-auto font-bold text-ink">{fmt(t.amount)}</span>
                </div>
              );
            })}
          </Card>
        </div>
      )}

      <div>
        <div className="text-sm font-semibold text-slate-600 mb-2 px-1">Activity</div>
        {expenses.length === 0 ? (
          <EmptyState icon="📝" title="No expenses yet" subtitle="Add your first expense to get started." />
        ) : (
          <Card className="divide-y divide-slate-100">
            {expenses.map((e) => <ExpenseRow key={e.id} expense={e} state={state} me={me} />)}
          </Card>
        )}
      </div>

      <AddExpenseModal open={showAdd} onClose={() => setShowAdd(false)} group={group} state={state} me={me} />
      <SettleUpModal open={showSettle} onClose={() => setShowSettle(false)} settlements={settlements} state={state} groupId={groupId} />
    </div>
  );
}

function ExpenseRow({ expense, state, me }) {
  const payer = state.people.find((p) => p.id === expense.paidBy);
  const isMe = expense.paidBy === me.id;
  const myShare = expense.splitBetween.includes(me.id) ? expense.amount / expense.splitBetween.length : 0;
  const myImpact = isMe ? expense.amount - myShare : -myShare;

  if (expense.type === "settlement") {
    const to = state.people.find((p) => p.id === expense.splitBetween[0]);
    return (
      <div className="p-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-accent-50 flex items-center justify-center text-accent-600 shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm"><span className="font-semibold">{payer?.name}</span> paid <span className="font-semibold">{to?.name}</span></div>
          <div className="text-xs text-slate-500">{new Date(expense.date).toLocaleDateString()}</div>
        </div>
        <div className="text-sm font-bold text-accent-600">{fmt(expense.amount)}</div>
      </div>
    );
  }

  return (
    <div className="p-3 flex items-center gap-3">
      <Avatar person={payer} size={36} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{expense.description}</div>
        <div className="text-xs text-slate-500">
          {isMe ? "You" : payer?.name ?? "—"} paid {fmt(expense.amount)} · split {expense.splitBetween.length} ways
        </div>
      </div>
      <div className="text-right">
        <div className={`text-sm font-bold ${myImpact >= 0 ? "text-accent-600" : "text-red-500"}`}>
          {myImpact >= 0 ? "+" : "-"}{fmt(myImpact)}
        </div>
        <button
          onClick={() => { if (confirm("Delete this expense?")) actions.deleteExpense(expense.id); }}
          className="text-[10px] text-slate-400 hover:text-red-500"
        >delete</button>
      </div>
    </div>
  );
}

function AddExpenseModal({ open, onClose, group, state, me }) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState(me.id);
  const [splitBetween, setSplitBetween] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setDescription("");
      setAmount("");
      setPaidBy(me.id);
      setSplitBetween(group?.memberIds ?? []);
      setError("");
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!group) return null;

  const submit = (e) => {
    e.preventDefault();
    if (!description.trim()) return setError("Add a description");
    const amt = parseFloat(amount);
    if (!(amt > 0)) return setError("Enter a valid amount");
    if (splitBetween.length === 0) return setError("Pick at least one person to split with");
    actions.addExpense({ groupId: group.id, description, amount: amt, paidBy, splitBetween });
    onClose();
  };

  const members = state.people.filter((p) => group.memberIds.includes(p.id));
  const toggleSplit = (id) =>
    setSplitBetween((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const perHead =
    parseFloat(amount) > 0 && splitBetween.length > 0 ? parseFloat(amount) / splitBetween.length : 0;

  return (
    <Modal open={open} onClose={onClose} title="Add expense">
      <form onSubmit={submit}>
        <Field label="What for?">
          <Input autoFocus value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Dinner, Uber, Groceries..." />
        </Field>
        <Field label="Amount (₹)">
          <Input type="number" inputMode="decimal" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </Field>
        <Field label="Paid by">
          <select
            value={paidBy}
            onChange={(e) => setPaidBy(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-accent-500 bg-white"
          >
            {members.map((p) => (
              <option key={p.id} value={p.id}>{p.name}{p.id === me.id ? " (you)" : ""}</option>
            ))}
          </select>
        </Field>
        <Field label={`Split equally between (${splitBetween.length})`}>
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {members.map((p) => (
              <label key={p.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={splitBetween.includes(p.id)}
                  onChange={() => toggleSplit(p.id)}
                  className="w-4 h-4 accent-accent-600"
                />
                <Avatar person={p} size={28} />
                <span className="text-sm flex-1">{p.name}</span>
                {splitBetween.includes(p.id) && perHead > 0 && (
                  <span className="text-xs text-slate-500">{fmt(perHead)}</span>
                )}
              </label>
            ))}
          </div>
        </Field>
        {error && <div className="text-sm text-red-600 mb-3">{error}</div>}
        <Button type="submit" className="w-full mt-2">Save expense</Button>
      </form>
    </Modal>
  );
}

function SettleUpModal({ open, onClose, settlements, state, groupId }) {
  return (
    <Modal open={open} onClose={onClose} title="Settle up">
      {settlements.length === 0 ? (
        <div className="text-sm text-slate-500 py-2">All settled — nothing to pay.</div>
      ) : (
        <div className="space-y-2">
          {settlements.map((t, i) => {
            const from = state.people.find((p) => p.id === t.from);
            const to = state.people.find((p) => p.id === t.to);
            return (
              <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                <Avatar person={from} size={32} />
                <div className="text-sm flex-1">
                  <span className="font-semibold">{from?.name}</span> → <span className="font-semibold">{to?.name}</span>
                  <div className="text-xs text-slate-500">{fmt(t.amount)}</div>
                </div>
                <Button
                  variant="ghost"
                  onClick={() => actions.settleUp({ groupId, fromId: t.from, toId: t.to, amount: t.amount })}
                  className="text-xs px-3 py-1.5"
                >Mark paid</Button>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

/* ---------------- People ---------------- */

function People({ state, me }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");

  const add = (e) => {
    e.preventDefault();
    setError("");
    const n = name.trim();
    if (!n) return setError("Name is required");
    if (state.people.some((p) => p.name.toLowerCase() === n.toLowerCase())) {
      return setError("Someone already has that name");
    }
    actions.addPerson(n);
    setName("");
  };

  const startEdit = (p) => { setEditingId(p.id); setEditName(p.name); };
  const saveEdit = () => {
    if (editName.trim()) actions.updatePerson(editingId, editName);
    setEditingId(null);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight pt-2">People</h1>

      <Card className="p-4">
        <form onSubmit={add} className="flex gap-2">
          <Input value={name} onChange={(e) => { setName(e.target.value); setError(""); }} placeholder="Add a person..." />
          <Button type="submit">Add</Button>
        </form>
        {error && <div className="text-sm text-red-600 mt-2">{error}</div>}
        <div className="text-xs text-slate-400 mt-2">
          People you add here don't have an account — they're just contacts to split with. They can sign up separately.
        </div>
      </Card>

      <Card className="divide-y divide-slate-100">
        {state.people.map((p) => {
          const hasAccount = p.isSelf;
          return (
            <div key={p.id} className="p-3 flex items-center gap-3">
              <Avatar person={p} size={40} />
              {editingId === p.id ? (
                <>
                  <Input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                    className="flex-1"
                  />
                  <Button onClick={saveEdit} className="text-xs px-3 py-1.5">Save</Button>
                  <Button variant="ghost" onClick={() => setEditingId(null)} className="text-xs px-3 py-1.5">Cancel</Button>
                </>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium flex items-center gap-2">
                      <span className="truncate">{p.name}</span>
                      {p.id === me.id && <span className="text-xs text-accent-600 font-semibold">you</span>}
                      {hasAccount && p.id !== me.id && <Badge tone="green">account</Badge>}
                    </div>
                  </div>
                  <button onClick={() => startEdit(p)} className="p-2 text-slate-400 hover:text-ink" aria-label="Edit">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
                  </button>
                  {!hasAccount && (
                    <button
                      onClick={() => { if (confirm(`Remove ${p.name}?`)) actions.deletePerson(p.id); }}
                      className="p-2 text-slate-400 hover:text-red-500" aria-label="Delete"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </Card>

      <div className="text-center pt-4">
        <button
          onClick={() => { if (confirm("Reset all data? This wipes everything including your account.")) actions.resetAll(); }}
          className="text-xs text-slate-400 hover:text-red-500"
        >Reset all data</button>
      </div>
    </div>
  );
}

/* ---------------- History ---------------- */

function History({ state }) {
  const [filter, setFilter] = useState("all");

  const groups = useMemo(() => {
    const filtered = filter === "all"
      ? state.events
      : state.events.filter((e) => filterMap[filter].includes(e.type));
    const byDay = {};
    for (const ev of filtered) {
      const day = new Date(ev.ts).toDateString();
      (byDay[day] ??= []).push(ev);
    }
    return Object.entries(byDay);
  }, [state.events, filter]);

  return (
    <div className="space-y-3">
      <div className="pt-2">
        <h1 className="text-2xl font-bold tracking-tight">History</h1>
        <p className="text-xs text-slate-500 mt-0.5">Every change, with who and when.</p>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {[
          { id: "all", label: "All" },
          { id: "expenses", label: "Expenses" },
          { id: "settlements", label: "Settlements" },
          { id: "groups", label: "Groups" },
          { id: "people", label: "People" },
          { id: "auth", label: "Auth" },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${filter === f.id ? "bg-ink text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >{f.label}</button>
        ))}
      </div>

      {groups.length === 0 ? (
        <EmptyState icon="📜" title="No history yet" subtitle="Activity will appear here as you use the app." />
      ) : (
        groups.map(([day, evs]) => (
          <div key={day}>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-1 mb-1.5">
              {dayLabel(day)}
            </div>
            <Card className="divide-y divide-slate-100">
              {evs.map((ev) => {
                // In single-tenant mode, the actor is always the owner (you)
                const actorPerson = state.people.find((p) => p.isSelf);
                return (
                  <div key={ev.id} className="p-3 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">{eventIcon(ev.type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm">{ev.label}</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {actorPerson?.name ?? "system"} · {new Date(ev.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </Card>
          </div>
        ))
      )}
    </div>
  );
}

const filterMap = {
  expenses: ["expense_added", "expense_deleted"],
  settlements: ["settlement_added"],
  groups: ["group_created", "group_deleted"],
  people: ["person_added", "person_renamed", "person_deleted"],
  auth: ["account_created", "signed_in", "signed_out"],
};

function dayLabel(day) {
  const d = new Date(day);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

/* ---------------- Notifications ---------------- */

function Notifications({ state, me, onBack, onOpenGroup }) {
  const myNotifs = state.notifications.filter((n) => n.toPersonId === me.id);
  const hasUnread = myNotifs.some((n) => !n.read);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between pt-2">
        <div>
          <button onClick={onBack} className="text-sm text-slate-500 hover:text-ink mb-1 inline-flex items-center gap-1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
            Back
          </button>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
        </div>
        {hasUnread && (
          <Button variant="ghost" onClick={() => actions.markNotificationsRead(me.id)} className="text-xs px-3 py-1.5">Mark all read</Button>
        )}
      </div>
      {myNotifs.length === 0 ? (
        <EmptyState icon="🔔" title="All quiet" subtitle="You'll be notified when someone adds an expense involving you." />
      ) : (
        <Card className="divide-y divide-slate-100">
          {myNotifs.map((n) => (
            <button
              key={n.id}
              onClick={() => n.groupId && onOpenGroup(n.groupId)}
              className={`w-full text-left p-3 flex items-start gap-3 hover:bg-slate-50 ${!n.read ? "bg-accent-50/40" : ""}`}
            >
              <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${!n.read ? "bg-accent-500" : "bg-slate-300"}`} />
              <div className="flex-1 min-w-0">
                <div className="text-sm">{n.message}</div>
                <div className="text-xs text-slate-400 mt-0.5">{timeAgo(n.ts)}</div>
              </div>
            </button>
          ))}
        </Card>
      )}
    </div>
  );
}

function timeAgo(ts) {
  const d = (Date.now() - ts) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
}

/* ---------------- Bottom Nav ---------------- */

function BottomNav({ view, setView }) {
  const tabs = [
    { id: "home", label: "Home", icon: <path d="M3 12l9-9 9 9M5 10v10h14V10" /> },
    {
      id: "groups", label: "Groups",
      icon: (
        <>
          <circle cx="9" cy="8" r="4"/>
          <path d="M17 11a3 3 0 1 0 0-6"/>
          <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
          <path d="M21 21v-2a4 4 0 0 0-3-3.87"/>
        </>
      ),
    },
    {
      id: "history", label: "History",
      icon: (
        <>
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 6v6l4 2"/>
        </>
      ),
    },
    {
      id: "people", label: "People",
      icon: (
        <>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
        </>
      ),
    },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 max-w-md mx-auto">
      <div className="m-3 bg-white rounded-2xl shadow-soft border border-slate-100 flex">
        {tabs.map((t) => {
          const active = view.name === t.id || (t.id === "groups" && view.name === "group");
          return (
            <button
              key={t.id}
              onClick={() => setView({ name: t.id })}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 ${active ? "text-accent-600" : "text-slate-400"}`}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {t.icon}
              </svg>
              <span className="text-[10px] font-semibold">{t.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/* ---------------- Splash + setup error ---------------- */

function SplashLoader({ label = "Loading…" }) {
  return (
    <div className="min-h-full max-w-md mx-auto flex flex-col items-center justify-center pt-32">
      <div className="w-12 h-12 rounded-2xl bg-accent-600 flex items-center justify-center text-white font-bold text-xl mb-4">S</div>
      <div className="flex items-center gap-2 text-slate-500 text-sm">
        <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12a9 9 0 1 1-6.2-8.55" />
        </svg>
        {label}
      </div>
    </div>
  );
}

function SetupError({ message }) {
  return (
    <div className="min-h-full max-w-md mx-auto px-5 pt-16">
      <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
        <div className="font-semibold text-red-700 mb-1">Something went wrong</div>
        <div className="text-sm text-red-600 mb-3">{message}</div>
        <div className="text-xs text-slate-600 leading-relaxed">
          This usually means the database schema hasn't been applied yet, or the new-user trigger didn't run.
          <ol className="list-decimal pl-5 mt-2 space-y-1">
            <li>In Supabase → SQL Editor, run the contents of <code>supabase/schema.sql</code>.</li>
            <li>Sign out and sign in again.</li>
          </ol>
        </div>
        <button
          onClick={() => auth.signOut()}
          className="mt-4 text-sm font-semibold text-accent-600 hover:text-accent-700"
        >Sign out</button>
      </div>
    </div>
  );
}
