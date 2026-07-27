import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useConfirm } from "../components/ConfirmDialog";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { MapPin, Plus, Trash2, Edit3, Check, X, AlertCircle, ChevronRight } from "lucide-react";
import type { Location } from "../lib/types";

export function Locations() {
  const { showConfirm } = useConfirm();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newParent, setNewParent] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);

  async function fetchLocations() {
    setLoading(true);
    const { data } = await supabase.from("locations").select("*").order("name");
    if (data) setLocations(data as Location[]);
    setLoading(false);
  }

  useEffect(() => { fetchLocations(); }, []);

  async function createLocation() {
    if (!newName.trim()) return;
    setSaving(true);
    setErrorMsg(null);
    const { error } = await supabase.from("locations").insert({
      name: newName.trim(),
      parent_id: newParent || null,
    });
    if (error) {
      setErrorMsg(error.message);
    } else {
      setNewName(""); setNewParent(""); setShowForm(false);
      fetchLocations();
    }
    setSaving(false);
  }

  async function updateLocation(id: string) {
    if (!editName.trim()) return;
    setSaving(true);
    setErrorMsg(null);
    const { error } = await supabase.from("locations").update({ name: editName.trim() }).eq("id", id);
    if (error) setErrorMsg(error.message);
    else { setEditingId(null); fetchLocations(); }
    setSaving(false);
  }

  async function deleteLocation(id: string) {
    setErrorMsg(null);
    const { error } = await supabase.from("locations").delete().eq("id", id);
    if (error) {
      if (error.message.includes("foreign key")) {
        setErrorMsg("This location has stock assigned. Remove them first from Dashboard.");
      } else {
        setErrorMsg(error.message);
      }
    } else {
      fetchLocations();
    }
  }

  const rootLocations = locations.filter((l) => !l.parent_id);
  const childrenOf = (parentId: string) => locations.filter((l) => l.parent_id === parentId);

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto pb-24">
      <div className="flex items-center gap-3">
        <MapPin className="w-6 h-6 text-emerald-400" />
        <h1 className="text-xl font-bold">Locations</h1>
        <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">{locations.length}</span>
        <button onClick={() => setShowForm(!showForm)} className="ml-auto w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center">
          <Plus className="w-4 h-4 text-white" />
        </button>
      </div>

      {errorMsg && (
        <div className="flex items-start gap-2 rounded-xl bg-red-900/20 border border-red-800/30 p-3 text-sm text-red-400">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="ml-auto text-red-500 hover:text-red-300">x</button>
        </div>
      )}

      {showForm && (
        <div className="rounded-xl bg-slate-900 p-4 space-y-3 border border-slate-800">
          <p className="text-sm font-medium text-slate-300">New location</p>
          <label className="block text-sm">
            Name
            <input value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full mt-1 rounded bg-slate-800 px-2 py-1" placeholder="e.g. Kitchen store" />
          </label>
          <label className="block text-sm">
            Parent (optional)
            <select value={newParent} onChange={(e) => setNewParent(e.target.value)} className="w-full mt-1 rounded bg-slate-800 px-2 py-1">
              <option value="">None (root level)</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <button onClick={createLocation} disabled={saving || !newName.trim()} className="flex-1 py-2 rounded-lg bg-emerald-500 text-sm disabled:opacity-50">
              {saving ? "Saving..." : "Create"}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg bg-slate-800 text-sm">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} height={56} radius={4} index={i} />)}
        </div>
      ) : locations.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <MapPin className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No locations yet. Create your first one!</p>
        </div>
      ) : (
        <div className="space-y-1">
          {rootLocations.map((loc) => (
            <LocationItem
              key={loc.id}
              location={loc}
              children={childrenOf(loc.id)}
              editingId={editingId}
              editName={editName}
              setEditName={setEditName}
              onStartEdit={() => { setEditingId(loc.id); setEditName(loc.name); }}
              onSaveEdit={() => updateLocation(loc.id)}
              onCancelEdit={() => setEditingId(null)}
              onDelete={() => showConfirm({
                title: `Delete "${loc.name}"?`,
                description: "Items in this location will lose their location reference.",
                actionLabel: "Delete",
                onAction: () => deleteLocation(loc.id),
              })}
              saving={saving}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LocationItem({
  location, children, editingId, editName, setEditName,
  onStartEdit, onSaveEdit, onCancelEdit, onDelete, saving,
}: {
  location: Location;
  children: Location[];
  editingId: string | null;
  editName: string;
  setEditName: (v: string) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  saving: boolean;
}) {
  const isEditing = editingId === location.id;

  return (
    <div>
      <div className="flex items-center gap-2 bg-slate-900/80 rounded-xl px-3 py-2.5 border border-slate-800/50">
        <MapPin className="w-4 h-4 text-slate-500 shrink-0" />
        {isEditing ? (
          <div className="flex items-center gap-1 flex-1">
            <input value={editName} onChange={(e) => setEditName(e.target.value)} className="flex-1 rounded bg-slate-800 px-2 py-1 text-sm" autoFocus />
            <button onClick={onSaveEdit} disabled={saving} className="w-7 h-7 rounded bg-emerald-500 flex items-center justify-center disabled:opacity-50"><Check className="w-3 h-3" /></button>
            <button onClick={onCancelEdit} className="w-7 h-7 rounded bg-slate-800 flex items-center justify-center"><X className="w-3 h-3" /></button>
          </div>
        ) : (
          <>
            <span className="text-sm flex-1">{location.name}</span>
            <div className="flex items-center gap-1">
              <button onClick={onStartEdit} className="w-7 h-7 rounded-full bg-slate-800/50 flex items-center justify-center hover:bg-slate-700"><Edit3 className="w-3 h-3 text-slate-400" /></button>
              <button onClick={onDelete} className="w-7 h-7 rounded-full bg-slate-800/50 flex items-center justify-center hover:bg-red-900/50"><Trash2 className="w-3 h-3 text-slate-500" /></button>
            </div>
          </>
        )}
      </div>
      {children.length > 0 && (
        <div className="ml-6 mt-1 space-y-1">
          {children.map((child) => (
            <LocationItem
              key={child.id}
              location={child}
              children={[]}
              editingId={editingId}
              editName={editName}
              setEditName={setEditName}
              onStartEdit={() => { /* inline edit only works for parent - children use root pattern too */ }}
              onSaveEdit={onSaveEdit}
              onCancelEdit={onCancelEdit}
              onDelete={onDelete}
              saving={saving}
            />
          ))}
        </div>
      )}
    </div>
  );
}
