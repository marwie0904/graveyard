import {
  BarChart, Bar, ComposedChart, Line, XAxis, YAxis,
  ResponsiveContainer, Cell, CartesianGrid,
} from "recharts";
import { DAY, fmt, nightAxis, nightTick } from "../time.js";
import { FONT_DISPLAY, FONT_TEXT, DOMAIN, tint } from "../tokens.js";
import { RANGES, rangeStats, readPatterns } from "../stats.js";
import { Card, Btn, Badge, Display, Eyebrow, RangeControl } from "../ui/index.jsx";
import { Info } from "../icons.jsx";

/* ============================================================================
   DASHBOARD

   Two charts, three tiles, four panels. Everything on this screen is derived
   from the NightRecords handed in as `nights`, which arrive newest first:
   dayOffset 0 is tonight, dayOffset 1 is last night. A range is therefore the
   FRONT of that array, and the charts get a reversed copy so bars read oldest
   to newest, left to right.

   Nothing here is a score and nothing here is graded, so no figure is ever
   fabricated: a missing value prints as "-" rather than as a zero.
============================================================================ */

const num = (v, digits = 1) => (v === null || v === undefined ? "-" : v.toFixed(digits));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function Panel({ T, cat, title, sub, line, children, height = 160 }) {
  return (
    <Card T={T} style={{ marginBottom: 12, padding: "16px 12px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 6px 12px" }}>
        <Badge category={cat} T={T} size={30} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: FONT_TEXT, fontSize: 15, fontWeight: 600, color: T.ink }}>{title}</div>
          <div style={{ fontFamily: FONT_TEXT, fontSize: 12.5, color: T.muted, marginTop: 1 }}>{sub}</div>
        </div>
      </div>
      {children && <div style={{ height }}>{children}</div>}
      {line && (
        <p style={{
          fontFamily: FONT_TEXT, fontSize: 13.5, lineHeight: 1.5, color: T.muted,
          margin: "12px 6px 0", paddingTop: 12, borderTop: `1px solid ${T.hair}`,
        }}>{line}</p>
      )}
    </Card>
  );
}

function Tile({ T, cat, k, v }) {
  return (
    <div style={{
      background: tint(DOMAIN[cat].hue, T.tintA), borderRadius: 18, padding: "13px 14px",
    }}>
      <div style={{ fontFamily: FONT_TEXT, fontSize: 12, color: T.muted }}>{k}</div>
      <div style={{
        fontFamily: FONT_DISPLAY, fontSize: 21, fontWeight: 700, color: DOMAIN[cat].hue,
        letterSpacing: "-0.02em", marginTop: 3,
      }}>{v}</div>
    </div>
  );
}

/* one plain figure: what it is on the left, what it was on the right */
function Figure({ T, k, v, hue }) {
  return (
    <div style={{
      display: "flex", alignItems: "baseline", gap: 12, padding: "11px 2px",
      borderTop: `1px solid ${T.hair}`,
    }}>
      <span style={{ fontFamily: FONT_TEXT, fontSize: 14, color: T.muted, flex: 1 }}>{k}</span>
      <span style={{
        fontFamily: FONT_TEXT, fontSize: 14.5, fontWeight: 600,
        color: hue || T.ink, textAlign: "right",
      }}>{v}</span>
    </div>
  );
}

function Tiles({ T, st }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
      <Tile T={T} cat="sleep" k="Average sleep"
        v={st.avgSleep === null ? "-" : `${st.avgSleep.toFixed(1)}h`} />
      <Tile T={T} cat="caffeine" k="Cutoff crossed"
        v={`${st.lateCount} ${st.lateCount === 1 ? "night" : "nights"}`} />
      <Tile T={T} cat="movement" k="Movement resets"
        v={st.movePct === null ? "-" : `${st.movePct}% done`} />
    </div>
  );
}

export default function Dashboard({ T, profile, nights, rangeKey, setRangeKey, say, setProfile }) {
  const spec = RANGES.find((r) => r.key === rangeKey) || RANGES[2];
  const today = nights.find((x) => x.dayOffset === 0) || null;

  /* Today means tonight and only tonight. Without it the range is empty, which
     is the honest answer; it must never fall through to last night's record. */
  const hist = rangeKey === "today"
    ? (today ? [today] : [])
    : nights.slice(0, spec.nights);

  const st = rangeStats(profile, hist);
  const pat = readPatterns(profile, st);

  /* ------------------------------- today ---------------------------------- */
  if (rangeKey === "today") {
    if (!today) {
      return (
        <div style={{ padding: "4px 20px 0" }}>
          <RangeControl T={T} value={rangeKey} onChange={setRangeKey} />
          <Eyebrow T={T}>Today</Eyebrow>
          <Display T={T} size={30} style={{ marginBottom: 8 }}>Nothing logged yet.</Display>
          <p style={{ fontFamily: FONT_TEXT, fontSize: 14.5, color: T.muted, lineHeight: 1.5 }}>
            Log caffeine, water, rest, or your sleep and tonight will appear here.
          </p>
        </div>
      );
    }

    const lateDrinks = today.cutoff === null
      ? 0
      : today.caffeine.filter((c) => nightAxis(c) >= nightAxis(today.cutoff)).length;

    return (
      <div style={{ padding: "4px 20px 0" }}>
        <RangeControl T={T} value={rangeKey} onChange={setRangeKey} />
        <Eyebrow T={T}>Today</Eyebrow>
        <Display T={T} size={30} style={{ marginBottom: 6 }}>
          {today.sleepHours === null
            ? "Tonight so far."
            : `${num(today.sleepHours)}h sleep before tonight.`}
        </Display>
        <p style={{ fontFamily: FONT_TEXT, fontSize: 14.5, color: T.muted, lineHeight: 1.45, marginBottom: 18 }}>
          One night on its own is a snapshot, not a pattern.
        </p>

        <Tiles T={T} st={st} />

        <Eyebrow T={T}>Tonight in figures</Eyebrow>
        <Card T={T} style={{ padding: "4px 16px 8px", marginBottom: 16 }}>
          <Figure T={T} k="Sleep" hue={DOMAIN.sleep.hue}
            v={today.sleepHours === null
              ? "Not logged"
              : `${num(today.sleepHours)}h${today.sleepEstimated ? " (estimated)" : ""}`} />
          <Figure T={T} k="Caffeine" hue={DOMAIN.caffeine.hue}
            v={today.cutoff === null
              ? plural(today.caffeine.length, "drink", "drinks")
              : `${plural(today.caffeine.length, "drink", "drinks")}, cutoff ${fmt(today.cutoff)}`} />
          <Figure T={T} k="After the cutoff" hue={DOMAIN.caffeine.hue}
            v={today.cutoff === null ? "No cutoff set" : plural(lateDrinks, "drink", "drinks")} />
          <Figure T={T} k="Movement resets" hue={DOMAIN.movement.hue}
            v={`${today.moveDone} of ${today.moveTotal} done`} />
          <Figure T={T} k="Rest taken" hue={DOMAIN.recovery.hue}
            v={today.restKind === "nap" ? `Nap, ${today.restMin} minutes`
              : today.restKind === "quiet" ? `Quiet rest, ${today.restMin} minutes`
              : "None yet"} />
          <Figure T={T} k="Water" hue={DOMAIN.water.hue}
            v={plural(today.water, "log", "logs")} />
        </Card>

        <p style={{
          fontFamily: FONT_TEXT, fontSize: 13.5, lineHeight: 1.5, color: T.muted,
          margin: "0 4px 16px",
        }}>{pat.movement}</p>

        <div style={{
          display: "flex", alignItems: "flex-start", gap: 8, margin: "0 4px 8px",
          fontFamily: FONT_TEXT, fontSize: 13, color: T.faint, lineHeight: 1.45,
        }}>
          <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          Charts need more than one night. Switch to 3 days or wider to see them.
        </div>
      </div>
    );
  }

  /* ------------------------------- range ---------------------------------- */
  const chrono = [...hist].reverse();
  const thin = Math.max(0, Math.floor(hist.length / 7) - 1);
  const axis = { fill: T.faint, fontSize: 10.5, fontFamily: FONT_TEXT };
  const dayLabel = (h) => (h.dayOffset === 0 ? "Now" : `${h.dayOffset}d`);

  const sleep = chrono.filter((h) => h.sleepStart !== null && h.sleepHours !== null).map((h) => ({
    id: h.id, day: dayLabel(h), base: nightAxis(h.sleepStart), len: h.sleepHours * 60,
    hours: h.sleepHours, estimated: !!h.sleepEstimated,
  }));
  /* Math.min/Math.max over [] return +/-Infinity, which used to reach the DOM
     as <YAxis domain={[Infinity, -Infinity]}> and blank the chart. */
  const bases = sleep.map((d) => d.base);
  const lo = bases.length ? Math.min(...bases) - 40 : 0;
  const hi = bases.length ? Math.max(...sleep.map((d) => d.base + d.len)) + 40 : DAY;
  const anyEstimated = sleep.some((d) => d.estimated);

  const caff = chrono.map((h) => {
    const row = { day: dayLabel(h), cutoff: h.cutoff === null ? null : nightAxis(h.cutoff) };
    h.caffeine.slice(0, 5).forEach((c, k) => { row[`c${k + 1}`] = nightAxis(c); });
    return row;
  });

  /* Sleep start spread and wake drift measure the same instability from two
     ends, so the panel reports whichever moved more rather than both. */
  const timingLine = (st.wakeDrift ?? 0) > (st.spread ?? 0) ? pat.wakeDrift : pat.sleepTiming;

  return (
    <div style={{ padding: "4px 20px 0" }}>
      <RangeControl T={T} value={rangeKey} onChange={setRangeKey} />

      <Eyebrow T={T}>{spec.label}</Eyebrow>
      <Display T={T} size={32} style={{ marginBottom: 6 }}>
        {st.avgSleep === null ? "No sleep logged yet." : `${num(st.avgSleep)}h average sleep.`}
      </Display>
      <p style={{ fontFamily: FONT_TEXT, fontSize: 14.5, color: T.muted, lineHeight: 1.45, marginBottom: 16 }}>
        {pat.sleepAvgLine}
      </p>

      <div style={{
        padding: "14px 16px", borderRadius: 18, marginBottom: 18,
        background: tint(DOMAIN.recovery.hue, T.tintA),
      }}>
        <div style={{
          fontFamily: FONT_TEXT, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.13em",
          textTransform: "uppercase", color: DOMAIN.recovery.hue, marginBottom: 7,
        }}>Main pattern</div>
        <p style={{ fontFamily: FONT_TEXT, fontSize: 14.5, lineHeight: 1.5, color: T.ink, margin: 0 }}>
          {pat.mainPattern}
        </p>
      </div>

      <Tiles T={T} st={st} />

      <Panel T={T} cat="sleep" title="When you slept" height={170}
        sub={anyEstimated
          ? "Each bar is one sleep block; faded bars are estimated"
          : "Each bar is one sleep block, start to wake"}
        line={`${timingLine} ${pat.fatigue}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={sleep} margin={{ left: -16, right: 8, top: 4, bottom: 0 }}>
            <CartesianGrid stroke={T.hair} vertical={false} />
            <XAxis dataKey="day" tick={axis} axisLine={false} tickLine={false} interval={thin} />
            <YAxis domain={[lo, hi]} tickFormatter={nightTick} tick={axis}
              axisLine={false} tickLine={false} width={40} />
            <Bar dataKey="base" stackId="a" fill="transparent" />
            <Bar dataKey="len" stackId="a" radius={[4, 4, 4, 4]}>
              {/* keyed by night id, not index: the range changes length as the
                  user switches windows, and index keys would recolour bars */}
              {sleep.map((d) => (
                <Cell key={d.id} fill={d.estimated ? tint(DOMAIN.sleep.hue, 0.35)
                  : d.hours < 5 ? DOMAIN.food.hue : DOMAIN.sleep.hue} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <Panel T={T} cat="caffeine" title="Caffeine against your cutoff"
        sub="Dots above the line landed too late" line={pat.caffeine}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={caff} margin={{ left: -14, right: 12, top: 8, bottom: 0 }}>
            <CartesianGrid stroke={T.hair} vertical={false} />
            <XAxis dataKey="day" tick={axis} axisLine={false} tickLine={false} interval={thin} />
            <YAxis tickFormatter={nightTick} tick={axis} axisLine={false} tickLine={false} width={40} />
            <Line dataKey="cutoff" stroke={DOMAIN.sleep.hue} strokeWidth={1.6}
              strokeDasharray="5 5" dot={false} />
            {["c1", "c2", "c3", "c4", "c5"].map((k) => (
              <Line key={k} dataKey={k} stroke="none"
                dot={{ r: hist.length > 20 ? 2.8 : 4, fill: DOMAIN.caffeine.hue, strokeWidth: 0 }} />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </Panel>

      <Panel T={T} cat="movement" title="Movement and rest"
        sub={`${st.moveDone} of ${st.moveTotal} resets · ${st.naps} naps · ${st.quiets} quiet rests · ${st.missed} missed`}
        line={`${pat.movement} ${pat.rest}`} />

      <Panel T={T} cat="light" title="Light and food"
        sub={`${st.lateLightDone} of ${st.n} late-light reminders done · ${num(st.waterAvg)} water logs per shift`}
        line={`${pat.light} ${pat.foodHydration}`} />

      <Eyebrow T={T}>What the plan noticed</Eyebrow>
      <Card T={T} style={{ padding: "6px 18px", marginBottom: 18 }}>
        {pat.noticed.map((nn, k) => (
          <div key={nn} style={{
            display: "flex", alignItems: "flex-start", gap: 10, padding: "13px 0",
            borderTop: k === 0 ? "none" : `1px solid ${T.hair}`,
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: 3, background: DOMAIN.recovery.hue,
              flexShrink: 0, marginTop: 7,
            }} />
            <span style={{ fontFamily: FONT_TEXT, fontSize: 14.5, color: T.ink, lineHeight: 1.5 }}>{nn}</span>
          </div>
        ))}
      </Card>

      <Eyebrow T={T}>Next plan adjustment</Eyebrow>
      <Card T={T} style={{ padding: 18, marginBottom: 16 }}>
        <p style={{ fontFamily: FONT_TEXT, fontSize: 14.5, lineHeight: 1.55, color: T.ink, margin: 0 }}>
          {pat.adjustment.text}
        </p>
        {pat.adjustment.apply && (
          <div style={{ display: "flex", gap: 9, marginTop: 16 }}>
            <Btn T={T} style={{ flex: 1.4, fontSize: 14.5 }} onClick={() => {
              setProfile(pat.adjustment.apply(profile));
              say(pat.adjustment.done);
            }}>Apply to next plan</Btn>
            <Btn T={T} kind="quiet" style={{ flex: 1, fontSize: 14.5 }}
              onClick={() => say("Keeping your current plan.")}>Keep current</Btn>
          </div>
        )}
      </Card>

      <div style={{
        display: "flex", alignItems: "flex-start", gap: 8, margin: "0 4px 8px",
        fontFamily: FONT_TEXT, fontSize: 13, color: T.faint, lineHeight: 1.45,
      }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} />
        Pattern tracking for sleep protection and recovery. Nothing here is a score,
        and nothing here is graded.
      </div>
    </div>
  );
}
