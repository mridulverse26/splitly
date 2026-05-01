import { useState, useMemo, useEffect } from "react";
import {
  useStore,
  actions,
  auth,
  currentProfile,
  myMemberInGroup,
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
  const me = currentProfile(state);
  const [view, setView] = useState({ name: "home" });

  if (state.loading && !state.session) return <SplashLoader label="Loading…" />;
  if (!state.session) return <LoginScreen />;
  if (!me) {
    if (state.error) return <SetupError message={state.error} />;
    return <SplashLoader label="Setting up your account…" />;
  }

  const unread = state.notifications.filter((n) => !n.read).length;

  return (
    <div className="min-h-full max-w-md mx-auto pb-24 relative">
      <Header me={me} unread={unread} onNotifClick={() => setView({ name: "notifs" })} />

      <main className="px-4 pt-2">
        {view.name === "home" && (
          <Home state={state} me={me}
            onOpenGroup={(id) => setView({ name: "group", id })}
            onGoGroups={() => setView({ name: "groups" })} />
        )}
        {view.name === "groups" && (
          <Groups state={state} me={me} onOpenGroup={(id) => setView({ name: "group", id })} />
        )}
        {view.name === "group" && (
          <GroupDetail state={state} groupId={view.id} me={me}
            onBack={() => setView({ name: "groups" })} />
        )}
        {view.name === "history" && <History state={state} />}
        {view.name === "notifs" && (
          <Notifications state={state} me={me}
            onBack={() => setView({ name: "home" })}
            onOpenGroup={(id) => setView({ name: "group", id })} />
        )}
      </main>

      <BottomNav view={view} setView={setView} />
    </div>
  );
}

/* ---------------- Header ---------------- */

function Header({ me, unread, onNotifClick }) {
  const [open, setOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
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
              <Avatar person={profileToPerson(me)} size={28} />
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
            </button>
            {open && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                <div className="absolute right-0 top-full mt-1 w-60 bg-white rounded-xl shadow-soft border border-slate-100 py-1 z-20 anim-slide">
                  <div className="px-3 py-2 flex items-center gap-2 border-b border-slate-100">
                    <Avatar person={profileToPerson(me)} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate">{me.displayName}</div>
                      <div className="text-xs text-slate-400 truncate">{me.email}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => { setOpen(false); setShowProfile(true); }}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50 flex items-center gap-2"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
                    Edit profile
                  </button>
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
      <ProfileEditor open={showProfile} onClose={() => setShowProfile(false)} me={me} />
    </header>
  );
}

function profileToPerson(p) {
  return p ? { id: p.id, name: p.displayName, color: p.color } : null;
}
function memberToPerson(m) {
  return m ? { id: m.id, name: m.displayName, color: m.color } : null;
}

/* ---------------- Profile editor ---------------- */

const COLORS = ["#10b981","#3b82f6","#f59e0b","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f97316","#6366f1","#84cc16"];

function ProfileEditor({ open, onClose, me }) {
  const [displayName, setDisplayName] = useState(me?.displayName ?? "");
  const [color, setColor] = useState(me?.color ?? "#10b981");
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) { setDisplayName(me?.displayName ?? ""); setColor(me?.color ?? "#10b981"); setError(""); }
  }, [open, me]);

  const submit = async (e) => {
    e.preventDefault();
    if (!displayName.trim()) return setError("Name is required");
    await actions.updateProfile({ displayName, color });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Edit profile">
      <form onSubmit={submit}>
        <Field label="Display name">
          <Input autoFocus value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </Field>
        <Field label="Color">
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)}
                style={{ background: c }}
                className={`w-9 h-9 rounded-full transition ${color === c ? "ring-2 ring-offset-2 ring-ink" : "hover:scale-110"}`}
                aria-label={c}
              />
            ))}
          </div>
        </Field>
        {error && <div className="text-sm text-red-600 mb-3">{error}</div>}
        <Button type="submit" className="w-full">Save</Button>
      </form>
    </Modal>
  );
}

/* ---------------- Home ---------------- */

function Home({ state, me, onOpenGroup, onGoGroups }) {
  const totals = useMemo(() => userTotalsAcrossGroups(state, me.id), [state, me.id]);

  return (
    <div className="space-y-4">
      <div className="pt-2">
        <div className="text-sm text-slate-500">Hi, {me.displayName.split(" ")[0]}</div>
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

      {Object.keys(totals.perUser).length > 0 && (
        <div>
          <div className="text-sm font-semibold text-slate-600 mb-2 px-1">Per person</div>
          <Card className="divide-y divide-slate-100">
            {Object.entries(totals.perUser).map(([uid, info]) => (
              <div key={uid} className="flex items-center gap-3 p-3">
                <Avatar person={{ id: uid, name: info.displayName, color: info.color }} size={36} />
                <div className="flex-1">
                  <div className="font-medium">{info.displayName}</div>
                  <div className="text-xs text-slate-500">{info.amount > 0 ? "owes you" : "you owe"}</div>
                </div>
                <div className={`font-bold ${info.amount > 0 ? "text-accent-600" : "text-red-500"}`}>{fmt(info.amount)}</div>
              </div>
            ))}
          </Card>
          <div className="text-[11px] text-slate-400 px-1 mt-1.5">
            Across-group totals only count registered users. Contacts show within their group.
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="text-sm font-semibold text-slate-600">Your groups</div>
          <button onClick={onGoGroups} className="text-xs text-accent-600 font-semibold">See all</button>
        </div>
        <div className="space-y-2">
          {state.groups.slice(0, 4).map((g) => (
            <GroupRow key={g.id} state={state} me={me} group={g} onClick={() => onOpenGroup(g.id)} />
          ))}
          {state.groups.length === 0 && (
            <EmptyState icon="👥" title="No groups yet" subtitle="Create your first group to start splitting." />
          )}
        </div>
      </div>
    </div>
  );
}

function GroupRow({ state, me, group, onClick }) {
  const net = userGroupNet(state, me.id, group.id);
  const inGroup = group.members.some((m) => m.userId === me.id);
  return (
    <Card className="p-4 flex items-center gap-3" onClick={onClick}>
      <div className="w-10 h-10 rounded-xl bg-accent-50 text-xl flex items-center justify-center shrink-0">{group.emoji ?? "👥"}</div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold truncate">{group.name}</div>
        <div className="text-xs text-slate-500">{group.members.length} members</div>
      </div>
      <div className="text-right">
        {!inGroup ? (
          <Badge>view only</Badge>
        ) : Math.abs(net) < 0.01 ? (
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

/* ---------------- Groups list ---------------- */

function Groups({ state, me, onOpenGroup }) {
  const [showAdd, setShowAdd] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-2xl font-bold tracking-tight">Groups</h1>
        <Button onClick={() => setShowAdd(true)}>+ New</Button>
      </div>
      {state.groups.length === 0 ? (
        <EmptyState icon="👥" title="No groups yet"
          subtitle="Create a group, then add members by their email or as contacts."
          action={<Button onClick={() => setShowAdd(true)}>Create group</Button>} />
      ) : (
        <div className="space-y-2">
          {state.groups.map((g) => (
            <GroupRow key={g.id} state={state} me={me} group={g} onClick={() => onOpenGroup(g.id)} />
          ))}
        </div>
      )}
      <AddGroupModal open={showAdd} onClose={() => setShowAdd(false)}
        onCreated={(id) => onOpenGroup(id)} />
    </div>
  );
}

function AddGroupModal({ open, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("👥");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (open) { setName(""); setEmoji("👥"); setError(""); } }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return setError("Name is required");
    setLoading(true);
    const id = await actions.addGroup(name, emoji);
    setLoading(false);
    if (id) {
      onClose();
      onCreated?.(id);
    } else {
      setError("Couldn't create group");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New group">
      <form onSubmit={submit}>
        <Field label="Group name">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Goa Trip" />
        </Field>
        <Field label="Icon">
          <div className="flex flex-wrap gap-2">
            {["👥","🏖️","🏠","✈️","🍕","🎬","🎉","🚗","🏔️","🛒"].map((em) => (
              <button key={em} type="button" onClick={() => setEmoji(em)}
                className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center ${emoji === em ? "bg-accent-50 ring-2 ring-accent-500" : "bg-slate-100 hover:bg-slate-200"}`}>{em}</button>
            ))}
          </div>
        </Field>
        {error && <div className="text-sm text-red-600 mb-3">{error}</div>}
        <Button type="submit" className="w-full mt-2" disabled={loading}>{loading ? "Creating…" : "Create group"}</Button>
        <p className="text-xs text-slate-400 mt-3 text-center">You'll add members on the next screen.</p>
      </form>
    </Modal>
  );
}

/* ---------------- Group detail ---------------- */

function GroupDetail({ state, groupId, me, onBack }) {
  const group = state.groups.find((g) => g.id === groupId);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showSettle, setShowSettle] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);

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

  const myMember = group.members.find((m) => m.userId === me.id);
  const myNet = myMember ? (balances[myMember.id] ?? 0) : 0;
  const isCreator = group.createdBy === me.id;

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
            <div className="text-xs text-slate-500">{group.members.length} members · {expenses.length} entries</div>
          </div>
          {isCreator && (
            <button
              onClick={() => { if (confirm(`Delete group "${group.name}"?`)) { actions.deleteGroup(groupId); onBack(); } }}
              className="p-2 text-slate-400 hover:text-red-500" aria-label="Delete">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
            </button>
          )}
        </div>
      </div>

      {myMember && (
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Your balance here</div>
          <div className={`text-2xl font-bold ${myNet >= 0 ? "text-accent-600" : "text-red-500"}`}>
            {myNet >= 0 ? "+" : "-"}{fmt(myNet)}
          </div>
          <div className="flex gap-2 mt-3">
            <Button onClick={() => setShowAddExpense(true)} className="flex-1">+ Add expense</Button>
            <Button variant="ghost" onClick={() => setShowSettle(true)} disabled={settlements.length === 0}>Settle up</Button>
          </div>
        </Card>
      )}

      <div>
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="text-sm font-semibold text-slate-600">Members ({group.members.length})</div>
          <button onClick={() => setShowAddMember(true)} className="text-xs font-semibold text-accent-600">+ Add member</button>
        </div>
        <Card className="divide-y divide-slate-100">
          {group.members.map((m) => {
            const isMe = m.userId === me.id;
            const isContact = !m.userId;
            return (
              <div key={m.id} className="p-3 flex items-center gap-3">
                <Avatar person={memberToPerson(m)} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium flex items-center gap-2">
                    <span className="truncate">{m.displayName}</span>
                    {isMe && <span className="text-xs text-accent-600 font-semibold">you</span>}
                    {isContact && <Badge>contact</Badge>}
                    {!isContact && !isMe && <Badge tone="green">user</Badge>}
                  </div>
                </div>
                {!isMe && (
                  <button
                    onClick={() => { if (confirm(`Remove ${m.displayName} from the group?`)) actions.removeMember(m.id); }}
                    className="p-2 text-slate-400 hover:text-red-500" aria-label="Remove">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                  </button>
                )}
              </div>
            );
          })}
        </Card>
      </div>

      {settlements.length > 0 && (
        <div>
          <div className="text-sm font-semibold text-slate-600 mb-2 px-1">Who owes whom</div>
          <Card className="divide-y divide-slate-100">
            {settlements.map((t, i) => {
              const from = group.members.find((m) => m.id === t.from);
              const to = group.members.find((m) => m.id === t.to);
              return (
                <div key={i} className="p-3 flex items-center gap-2 text-sm">
                  <Avatar person={memberToPerson(from)} size={28} />
                  <span className="font-medium">{from?.displayName}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
                  <Avatar person={memberToPerson(to)} size={28} />
                  <span className="font-medium">{to?.displayName}</span>
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
          <EmptyState icon="📝" title="No expenses yet" subtitle="Add the first expense to get started." />
        ) : (
          <Card className="divide-y divide-slate-100">
            {expenses.map((e) => <ExpenseRow key={e.id} expense={e} group={group} me={me} />)}
          </Card>
        )}
      </div>

      <AddExpenseModal open={showAddExpense} onClose={() => setShowAddExpense(false)} group={group} me={me} />
      <SettleUpModal open={showSettle} onClose={() => setShowSettle(false)} settlements={settlements} group={group} groupId={groupId} />
      <AddMemberModal open={showAddMember} onClose={() => setShowAddMember(false)} group={group} />
    </div>
  );
}

function ExpenseRow({ expense, group, me }) {
  const payer = group.members.find((m) => m.id === expense.paidBy);
  const myMember = group.members.find((m) => m.userId === me.id);
  const isMe = myMember && expense.paidBy === myMember.id;
  const myShare = myMember && expense.splitBetween.includes(myMember.id)
    ? expense.amount / expense.splitBetween.length : 0;
  const myImpact = isMe ? expense.amount - myShare : -myShare;

  if (expense.type === "settlement") {
    const to = group.members.find((m) => m.id === expense.splitBetween[0]);
    return (
      <div className="p-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-accent-50 flex items-center justify-center text-accent-600 shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm"><span className="font-semibold">{payer?.displayName}</span> paid <span className="font-semibold">{to?.displayName}</span></div>
          <div className="text-xs text-slate-500">{new Date(expense.date).toLocaleDateString()}</div>
        </div>
        <div className="text-sm font-bold text-accent-600">{fmt(expense.amount)}</div>
      </div>
    );
  }

  const canDelete = expense.createdBy === me.id;
  return (
    <div className="p-3 flex items-center gap-3">
      <Avatar person={memberToPerson(payer)} size={36} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{expense.description}</div>
        <div className="text-xs text-slate-500">
          {isMe ? "You" : payer?.displayName ?? "—"} paid {fmt(expense.amount)} · split {expense.splitBetween.length} ways
        </div>
      </div>
      <div className="text-right">
        {myMember && (
          <div className={`text-sm font-bold ${myImpact >= 0 ? "text-accent-600" : "text-red-500"}`}>
            {myImpact >= 0 ? "+" : "-"}{fmt(myImpact)}
          </div>
        )}
        {canDelete && (
          <button
            onClick={() => { if (confirm("Delete this expense?")) actions.deleteExpense(expense.id); }}
            className="text-[10px] text-slate-400 hover:text-red-500">delete</button>
        )}
      </div>
    </div>
  );
}

function AddExpenseModal({ open, onClose, group, me }) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState("");
  const [splitBetween, setSplitBetween] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && group) {
      const myMember = group.members.find((m) => m.userId === me.id);
      setDescription("");
      setAmount("");
      setPaidBy(myMember?.id ?? group.members[0]?.id ?? "");
      setSplitBetween(group.members.map((m) => m.id));
      setError("");
    }
  }, [open, group, me]);

  if (!group) return null;

  const submit = (e) => {
    e.preventDefault();
    if (!description.trim()) return setError("Add a description");
    const amt = parseFloat(amount);
    if (!(amt > 0)) return setError("Enter a valid amount");
    if (splitBetween.length === 0) return setError("Pick at least one person to split with");
    if (!paidBy) return setError("Pick who paid");
    actions.addExpense({ groupId: group.id, description, amount: amt, paidBy, splitBetween });
    onClose();
  };

  const toggle = (id) =>
    setSplitBetween((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const perHead = parseFloat(amount) > 0 && splitBetween.length > 0
    ? parseFloat(amount) / splitBetween.length : 0;

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
          <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-accent-500 bg-white">
            {group.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}{m.userId === me.id ? " (you)" : ""}{!m.userId ? " (contact)" : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Split equally between (${splitBetween.length})`}>
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {group.members.map((m) => (
              <label key={m.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 cursor-pointer">
                <input type="checkbox" checked={splitBetween.includes(m.id)} onChange={() => toggle(m.id)}
                  className="w-4 h-4 accent-accent-600" />
                <Avatar person={memberToPerson(m)} size={28} />
                <span className="text-sm flex-1">{m.displayName}{m.userId === me.id ? " (you)" : ""}</span>
                {splitBetween.includes(m.id) && perHead > 0 && (
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

function SettleUpModal({ open, onClose, settlements, group, groupId }) {
  return (
    <Modal open={open} onClose={onClose} title="Settle up">
      {settlements.length === 0 ? (
        <div className="text-sm text-slate-500 py-2">All settled — nothing to pay.</div>
      ) : (
        <div className="space-y-2">
          {settlements.map((t, i) => {
            const from = group.members.find((m) => m.id === t.from);
            const to = group.members.find((m) => m.id === t.to);
            return (
              <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                <Avatar person={memberToPerson(from)} size={32} />
                <div className="text-sm flex-1">
                  <span className="font-semibold">{from?.displayName}</span> → <span className="font-semibold">{to?.displayName}</span>
                  <div className="text-xs text-slate-500">{fmt(t.amount)}</div>
                </div>
                <Button variant="ghost"
                  onClick={() => actions.settleUp({ groupId, fromId: t.from, toId: t.to, amount: t.amount })}
                  className="text-xs px-3 py-1.5">Mark paid</Button>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

/* ---------------- Add member modal (registered user OR contact) ---------------- */

function AddMemberModal({ open, onClose, group }) {
  const state = useStore();
  const [tab, setTab] = useState("registered");
  const [query, setQuery] = useState("");
  const [profiles, setProfiles] = useState([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [contactName, setContactName] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!open) return;
    setTab("registered"); setQuery(""); setContactName(""); setError(""); setBusyId(null);
    setLoadingProfiles(true);
    actions.listProfiles().then((list) => {
      setProfiles(list);
      setLoadingProfiles(false);
    });
  }, [open]);

  const myId = state.session?.user?.id;
  const memberIds = new Set(group.members.map((m) => m.userId).filter(Boolean));
  // Exclude self + already-added members; filter by query (matches name or email)
  const q = query.trim().toLowerCase();
  const visibleProfiles = profiles
    .filter((p) => p.id !== myId && !memberIds.has(p.id))
    .filter((p) =>
      !q ||
      p.displayName.toLowerCase().includes(q) ||
      p.email.toLowerCase().includes(q)
    );

  const addRegistered = async (profile) => {
    setBusyId(profile.id);
    setError("");
    try {
      await actions.addRegisteredMember(group.id, profile.id, profile);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const addContact = async (e) => {
    e.preventDefault();
    setError("");
    if (!contactName.trim()) return setError("Name is required");
    setBusyId("contact");
    try {
      await actions.addContactMember(group.id, contactName);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add member">
      <div className="flex bg-slate-100 rounded-xl p-1 mb-4 text-sm font-semibold">
        <button type="button" onClick={() => setTab("registered")}
          className={`flex-1 py-1.5 rounded-lg ${tab === "registered" ? "bg-white shadow-sm text-ink" : "text-slate-500"}`}>
          Registered user
        </button>
        <button type="button" onClick={() => setTab("contact")}
          className={`flex-1 py-1.5 rounded-lg ${tab === "contact" ? "bg-white shadow-sm text-ink" : "text-slate-500"}`}>
          Contact
        </button>
      </div>

      {tab === "registered" ? (
        <>
          <Field label="Search by name or email">
            <Input
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to filter…"
            />
          </Field>

          <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
            {loadingProfiles ? (
              <div className="p-4 text-sm text-slate-500 text-center">Loading users…</div>
            ) : visibleProfiles.length === 0 ? (
              <div className="p-4 text-sm text-slate-500 text-center">
                {q ? "No users match that search." : "No more registered users to add."}
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {visibleProfiles.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => addRegistered(p)}
                      disabled={busyId === p.id}
                      className="w-full text-left p-3 flex items-center gap-3 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <Avatar person={{ id: p.id, name: p.displayName, color: p.color }} size={32} />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{p.displayName}</div>
                        <div className="text-xs text-slate-500 truncate">{p.email}</div>
                      </div>
                      <span className="text-xs text-accent-600 font-semibold">
                        {busyId === p.id ? "Adding…" : "+ Add"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && <div className="text-sm text-red-600 mt-3">{error}</div>}

          <p className="text-xs text-slate-400 mt-4 text-center leading-relaxed">
            Pick anyone who's signed up to Splitly. They'll see this group and can add expenses.
          </p>
        </>
      ) : (
        <form onSubmit={addContact}>
          <Field label="Contact name">
            <Input autoFocus value={contactName} onChange={(e) => setContactName(e.target.value)}
              placeholder="e.g. Dad, Roommate, Bob" />
          </Field>
          {error && <div className="text-sm text-red-600 mb-3">{error}</div>}
          <Button type="submit" className="w-full" disabled={busyId === "contact"}>
            {busyId === "contact" ? "Adding…" : "Add contact"}
          </Button>
          <p className="text-xs text-slate-400 mt-4 text-center leading-relaxed">
            Contacts don't have an account — they're just a name to track splits with.
          </p>
        </form>
      )}
    </Modal>
  );
}

/* ---------------- History ---------------- */

function History({ state }) {
  const [filter, setFilter] = useState("all");

  const groupsByDay = useMemo(() => {
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
        <p className="text-xs text-slate-500 mt-0.5">Every change in groups you're in.</p>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {[
          { id: "all", label: "All" },
          { id: "expenses", label: "Expenses" },
          { id: "settlements", label: "Settlements" },
          { id: "groups", label: "Groups" },
          { id: "members", label: "Members" },
        ].map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${filter === f.id ? "bg-ink text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {groupsByDay.length === 0 ? (
        <EmptyState icon="📜" title="No history yet" subtitle="Activity will appear here as you use the app." />
      ) : (
        groupsByDay.map(([day, evs]) => (
          <div key={day}>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-1 mb-1.5">{dayLabel(day)}</div>
            <Card className="divide-y divide-slate-100">
              {evs.map((ev) => {
                const group = state.groups.find((g) => g.id === ev.groupId);
                return (
                  <div key={ev.id} className="p-3 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">{eventIcon(ev.type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm">{ev.label}</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {group?.name ? `${group.name} · ` : ""}{new Date(ev.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
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
  members: ["member_added", "member_removed"],
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

function Notifications({ state, onBack, onOpenGroup }) {
  const hasUnread = state.notifications.some((n) => !n.read);
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
          <Button variant="ghost" onClick={() => actions.markNotificationsRead()} className="text-xs px-3 py-1.5">Mark all read</Button>
        )}
      </div>
      {state.notifications.length === 0 ? (
        <EmptyState icon="🔔" title="All quiet" subtitle="You'll be notified when someone adds you to a group or splits an expense involving you." />
      ) : (
        <Card className="divide-y divide-slate-100">
          {state.notifications.map((n) => (
            <button key={n.id}
              onClick={() => n.groupId && onOpenGroup(n.groupId)}
              className={`w-full text-left p-3 flex items-start gap-3 hover:bg-slate-50 ${!n.read ? "bg-accent-50/40" : ""}`}>
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
    { id: "groups", label: "Groups", icon: (
      <>
        <circle cx="9" cy="8" r="4"/>
        <path d="M17 11a3 3 0 1 0 0-6"/>
        <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
        <path d="M21 21v-2a4 4 0 0 0-3-3.87"/>
      </>
    ) },
    { id: "history", label: "History", icon: (
      <>
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 6v6l4 2"/>
      </>
    ) },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 max-w-md mx-auto">
      <div className="m-3 bg-white rounded-2xl shadow-soft border border-slate-100 flex">
        {tabs.map((t) => {
          const active = view.name === t.id || (t.id === "groups" && view.name === "group");
          return (
            <button key={t.id} onClick={() => setView({ name: t.id })}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 ${active ? "text-accent-600" : "text-slate-400"}`}>
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
        <button onClick={() => auth.signOut()}
          className="mt-2 text-sm font-semibold text-accent-600 hover:text-accent-700">Sign out</button>
      </div>
    </div>
  );
}
