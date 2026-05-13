import { useEffect, useState } from "react";
import type { MealEntry } from "@dragonfly/shared";
import { api } from "../api.js";
import { useSession } from "../session.js";

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}

export function FoodDiary() {
  const { patient } = useSession();
  const [meals, setMeals] = useState<MealEntry[]>([]);
  const [description, setDescription] = useState("");
  const [carbs, setCarbs] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!patient) return;
    api.mealsList(patient.id).then(setMeals).catch((e) => setError(String(e)));
  }, [patient]);

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setPhotoFile(null);
      setPhotoPreview(null);
      return;
    }
    setPhotoFile(file);
    const r = new FileReader();
    r.onload = () => setPhotoPreview(typeof r.result === "string" ? r.result : null);
    r.readAsDataURL(file);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!patient || !description.trim()) return;
    setError(null);
    setSaving(true);
    try {
      // If the participant attached a photo, upload it to private R2
      // first via the Worker-signed two-step flow, then attach the
      // signed get URL to the meal entry.
      let imageUrl: string | undefined;
      if (photoFile) {
        const up = await api.uploadMealPhoto(patient.id, photoFile);
        imageUrl = up.getUrl;
      }
      const meal = await api.addMeal({
        patientId: patient.id,
        description: description.trim(),
        carbsGrams: carbs.trim() ? Number(carbs) : undefined,
        imageUrl,
      });
      setMeals([meal, ...meals]);
      setDescription("");
      setCarbs("");
      setPhotoFile(null);
      setPhotoPreview(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header className="app-bar">
        <h1>Food diary</h1>
      </header>

      <main className="screen">
        <form className="card" onSubmit={submit}>
          <h2>What did you eat?</h2>
          <div className="field" style={{ marginTop: 8 }}>
            <label htmlFor="desc">Description</label>
            <input
              id="desc"
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brown rice with bok choy"
              required
            />
          </div>
          <div className="field" style={{ marginTop: 16 }}>
            <label htmlFor="carbs">Carbs (g, optional)</label>
            <input
              id="carbs"
              className="input"
              type="number"
              inputMode="numeric"
              value={carbs}
              onChange={(e) => setCarbs(e.target.value)}
              placeholder="e.g. 30"
              min={0}
              max={500}
            />
          </div>
          <div className="field" style={{ marginTop: 16 }}>
            <label htmlFor="photo">Photo (optional)</label>
            <input
              id="photo"
              className="input"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onPhoto}
              style={{ paddingTop: 16 }}
            />
            {photoPreview && (
              <img
                src={photoPreview}
                alt="Meal preview"
                style={{ marginTop: 12, width: "100%", borderRadius: 12 }}
              />
            )}
          </div>
          {error && <p className="status-critical" style={{ marginTop: 16 }}>{error}</p>}
          <button
            className="btn btn-primary"
            type="submit"
            disabled={saving}
            style={{ marginTop: 24 }}
          >
            {saving ? "Saving…" : "Save meal"}
          </button>
        </form>

        <h2 className="section-title">Recent meals</h2>
        <ul className="list">
          {meals.map((m) => (
            <li key={m.id}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 18 }}>{m.description}</div>
                <div className="meta">
                  <span>{fmtTime(m.capturedAt)}</span>
                  {typeof m.carbsGrams === "number" && <span>{m.carbsGrams} g carbs</span>}
                </div>
              </div>
            </li>
          ))}
          {meals.length === 0 && (
            <li>
              <span style={{ color: "var(--color-secondary)" }}>No meals logged yet.</span>
            </li>
          )}
        </ul>
      </main>
    </>
  );
}
