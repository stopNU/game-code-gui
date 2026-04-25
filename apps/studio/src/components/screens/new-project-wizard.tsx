import { useEffect, useRef, useState } from 'react';
import { trpc } from '@renderer/lib/trpc';

interface NewProjectWizardProps {
  onBack: () => void;
  onCreate: (details: { name: string; path: string; engine: EngineId; provider: ProviderId; model: string; template: BriefPresetId; brief: string }) => void;
}

const STEP_LABELS = ['Project', 'Engine', 'AI', 'Template', 'Review'] as const;
const STEP_TITLES = [
  'Name your project',
  'Choose an engine',
  'Set up AI',
  'Pick a template',
  'Review & create',
];

const ENGINES = [
  { id: 'godot42', label: 'Godot 4.2', sub: 'GDScript · C# · open source',      icon: '◆', disabled: true  },
  { id: 'godot43', label: 'Godot 4.3', sub: 'Latest stable · GDScript · C#',    icon: '◆', disabled: false },
  { id: 'unity6',  label: 'Unity 6',   sub: 'C# · HDRP / URP pipelines',        icon: '◇', disabled: true  },
  { id: 'custom',  label: 'Custom',    sub: 'Point to any project root',         icon: '○', disabled: false },
] as const;

type EngineId = typeof ENGINES[number]['id'];

const PROVIDERS = [
  {
    id: 'anthropic' as const,
    label: 'Anthropic',
    models: [
      { id: 'claude-sonnet-4-6',         label: 'Sonnet 4.6' },
      { id: 'claude-opus-4-6',           label: 'Opus 4.6' },
      { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
    ],
  },
  {
    id: 'codex' as const,
    label: 'OpenAI Codex',
    models: [
      { id: 'gpt-5.4', label: 'GPT-5.4' },
    ],
  },
] as const;

type ProviderId = typeof PROVIDERS[number]['id'];

// All options produce a Godot 4 GDScript deckbuilder roguelike — the preset seeds
// the AI brief with a theme and art-direction so the generated content fits a setting.
const BRIEF_PRESETS = [
  {
    id: 'custom',
    label: 'Custom Brief',
    sub: 'Write your own from scratch',
    icon: '□',
    brief: '',
  },
  {
    id: 'dark-fantasy',
    label: 'Dark Fantasy',
    sub: 'Slay the Spire style · magic, monsters, dungeons',
    icon: '◆',
    brief: 'A dark fantasy deckbuilder roguelike. The player is an adventurer delving through cursed dungeons, collecting spell cards and magical relics, fighting demons and undead. Grim atmosphere, hand-drawn-style art, deep card synergies.',
  },
  {
    id: 'sci-fi',
    label: 'Sci-Fi',
    sub: 'Mechs and aliens · energy weapons, orbital stations',
    icon: '◈',
    brief: 'A sci-fi deckbuilder roguelike set aboard a derelict space station. The player pilots a combat mech, using energy weapon cards and system-overload abilities to fight alien organisms and rogue robots. Clean UI, neon accents.',
  },
  {
    id: 'cosmic-horror',
    label: 'Cosmic Horror',
    sub: 'Lovecraftian · eldritch cards, sanity mechanics',
    icon: '◉',
    brief: 'A cosmic horror deckbuilder roguelike. The investigator descends into an eldritch cult stronghold, wielding forbidden knowledge cards. A sanity meter replaces HP — lose your mind and the deck mutates. Tentacles, rituals, forbidden relics.',
  },
  {
    id: 'cyberpunk',
    label: 'Cyberpunk',
    sub: 'Neon dystopia · hacking, corps, street runners',
    icon: '▤',
    brief: 'A cyberpunk deckbuilder roguelike in a rain-soaked mega-city. The runner uses hack cards and cyberware relics to fight corporate security drones through layers of a corporate arcology. Glitch effects, neon palette.',
  },
  {
    id: 'mythological',
    label: 'Mythological',
    sub: 'Gods and heroes · pantheons, legendary relics',
    icon: '◎',
    brief: 'A mythological deckbuilder roguelike where a demigod battles through the underworld. Cards channel powers of Greek gods; relics are legendary artefacts. Procedural encounters based on myths, boss fights against titans.',
  },
] as const;

type BriefPresetId = typeof BRIEF_PRESETS[number]['id'];

const SCAFFOLD_STEPS = [
  'Initialising project directory…',
  'Copying Godot 4.3 template files…',
  'Writing project.godot config…',
  'Scaffolding src/ folder structure…',
  'Generating starter scenes…',
  'Seeding content data (cards, enemies, relics)…',
  'Installing AI provider configuration…',
  'Writing .harness/config.json…',
  'Running initial headless syntax check…',
  'Project ready.',
] as const;

const T = {
  bg0: '#080a0f',
  bg2: '#11141f',
  bg3: '#161b28',
  bg4: '#1c2133',
  border: '#1a1f30',
  border2: '#242b3d',
  text0: '#eceef5',
  text1: '#9aa0bc',
  text2: '#545c7a',
  text3: '#363d57',
  accent: '#4d9eff',
  accentLo: '#1a3a6e',
  green: '#3dca7e',
  greenLo: '#14311f',
  mono: "'IBM Plex Mono', monospace" as const,
  sans: "'IBM Plex Sans', sans-serif" as const,
};

function SelectCard({
  item,
  selected,
  onSelect,
  wide,
}: {
  item: { id: string; label: string; sub: string; icon: string; disabled?: boolean };
  selected: string;
  onSelect: (id: string) => void;
  wide?: boolean;
}): JSX.Element {
  const [hov, setHov] = useState(false);
  const active = selected === item.id;
  const disabled = item.disabled === true;
  return (
    <div
      onClick={() => { if (!disabled) onSelect(item.id); }}
      onMouseEnter={() => { if (!disabled) setHov(true); }}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: wide ? '12px 14px' : '14px 14px',
        borderRadius: 5,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        background: active ? T.accentLo : hov ? T.bg3 : T.bg2,
        border: `1px solid ${active ? T.accent + '77' : hov ? T.border2 : T.border}`,
        display: 'flex',
        alignItems: wide ? 'center' : 'flex-start',
        gap: 12,
        transition: 'all 0.12s',
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 4,
          flexShrink: 0,
          background: active ? T.accentLo : T.bg4,
          border: `1px solid ${active ? T.accent + '55' : T.border2}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 13,
          color: active ? T.accent : T.text2,
        }}
      >
        {item.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: active ? T.text0 : T.text1, marginBottom: 2 }}>
          {item.label}
        </div>
        <div style={{ fontSize: 10, color: T.text2, fontFamily: T.mono, lineHeight: 1.4 }}>
          {item.sub}
        </div>
      </div>
      {disabled && (
        <span style={{ fontSize: 9, fontFamily: T.mono, color: T.text3, border: `1px solid ${T.border2}`, borderRadius: 3, padding: '2px 6px', flexShrink: 0 }}>
          soon
        </span>
      )}
      {active && !disabled && (
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.accent, flexShrink: 0 }} />
      )}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div
      style={{
        fontSize: 10,
        fontFamily: T.mono,
        color: T.text2,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        marginBottom: 7,
      }}
    >
      {children}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  mono,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}): JSX.Element {
  const [focused, setFocused] = useState(false);
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        width: '100%',
        background: T.bg2,
        border: `1px solid ${focused ? T.accent + '99' : T.border2}`,
        borderRadius: 4,
        padding: '9px 12px',
        outline: 'none',
        fontFamily: mono ? T.mono : T.sans,
        fontSize: 12,
        color: T.text0,
        transition: 'border-color 0.15s',
      }}
    />
  );
}

export function NewProjectWizard({ onBack, onCreate }: NewProjectWizardProps): JSX.Element {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [path, setPath] = useState('~/dev/');
  const [pathManuallyEdited, setPathManuallyEdited] = useState(false);
  const [engine, setEngine] = useState<EngineId>('godot43');
  const [provider, setProvider] = useState<ProviderId>('anthropic');
  const [model, setModel] = useState<string>('claude-sonnet-4-6');
  const [template, setTemplate] = useState<BriefPresetId>('dark-fantasy');
  const [creating, setCreating] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [logDone, setLogDone] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const chooseDirectory = trpc.runtime.chooseDirectory.useMutation();

  useEffect(() => {
    if (!pathManuallyEdited) {
      setPath(name.trim() ? `~/dev/${name.trim().toLowerCase().replace(/\s+/g, '-')}` : '~/dev/');
    }
  }, [name, pathManuallyEdited]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logLines]);

  const startCreate = (): void => {
    setCreating(true);
    setLogLines([]);
    setLogDone(false);
    SCAFFOLD_STEPS.forEach((line, i) => {
      setTimeout(() => {
        setLogLines((l) => [...l, line]);
        if (i === SCAFFOLD_STEPS.length - 1) {
          setTimeout(() => setLogDone(true), 400);
        }
      }, 280 + i * 420);
    });
  };

  const canNext = [
    name.trim().length > 0,
    true,
    true,
    true,
    true,
  ][step];

  const handleBrowse = async (): Promise<void> => {
    const chosen = await chooseDirectory.mutateAsync({});
    if (chosen !== null) {
      setPath(chosen);
      setPathManuallyEdited(true);
    }
  };

  const stepContent = [
    // Step 0: Name & path
    <div key="s0" style={{ display: 'flex', flexDirection: 'column', gap: 18, animation: 'fadeUp 0.35s cubic-bezier(0.16,1,0.3,1) both' }}>
      <div>
        <FieldLabel>Project Name</FieldLabel>
        <TextInput value={name} onChange={setName} placeholder="My Awesome Game" />
      </div>
      <div>
        <FieldLabel>Directory</FieldLabel>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <TextInput
              value={path}
              onChange={(v) => { setPath(v); setPathManuallyEdited(true); }}
              placeholder="~/dev/my-game"
              mono
            />
          </div>
          <button
            onClick={() => void handleBrowse()}
            disabled={chooseDirectory.isPending}
            style={{
              padding: '0 14px',
              background: T.bg3,
              border: `1px solid ${T.border2}`,
              borderRadius: 4,
              color: T.text1,
              fontSize: 11,
              cursor: 'pointer',
              fontFamily: T.mono,
              whiteSpace: 'nowrap',
              opacity: chooseDirectory.isPending ? 0.6 : 1,
            }}
          >
            Browse…
          </button>
        </div>
        <div style={{ fontSize: 10, fontFamily: T.mono, color: T.text2, marginTop: 5 }}>
          The folder will be created if it doesn't exist.
        </div>
      </div>
    </div>,

    // Step 1: Engine
    <div key="s1" style={{ display: 'flex', flexDirection: 'column', gap: 8, animation: 'fadeUp 0.35s cubic-bezier(0.16,1,0.3,1) both' }}>
      {ENGINES.map((e) => (
        <SelectCard key={e.id} item={e} selected={engine} onSelect={(id) => setEngine(id as EngineId)} wide />
      ))}
    </div>,

    // Step 2: AI provider + model
    <div key="s2" style={{ display: 'flex', flexDirection: 'column', gap: 18, animation: 'fadeUp 0.35s cubic-bezier(0.16,1,0.3,1) both' }}>
      <div>
        <FieldLabel>Provider</FieldLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {PROVIDERS.map((p) => (
            <div
              key={p.id}
              onClick={() => {
                setProvider(p.id);
                setModel(p.models[0].id);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 5,
                cursor: 'pointer',
                background: provider === p.id ? T.accentLo : T.bg2,
                border: `1px solid ${provider === p.id ? T.accent + '66' : T.border}`,
                transition: 'all 0.12s',
              }}
            >
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: provider === p.id ? T.accent : T.text3, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 500, color: provider === p.id ? T.text0 : T.text1, flex: 1 }}>
                {p.label}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <FieldLabel>Model</FieldLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {PROVIDERS.find((p) => p.id === provider)?.models.map((m) => (
            <button
              key={m.id}
              onClick={() => setModel(m.id)}
              style={{
                padding: '5px 12px',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 11,
                fontFamily: T.mono,
                background: model === m.id ? T.accentLo : T.bg3,
                color: model === m.id ? T.accent : T.text1,
                border: `1px solid ${model === m.id ? T.accent + '55' : T.border2}`,
                transition: 'all 0.12s',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
    </div>,

    // Step 3: Template (deckbuilder theme / brief preset)
    <div
      key="s3"
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 8,
        animation: 'fadeUp 0.35s cubic-bezier(0.16,1,0.3,1) both',
      }}
    >
      {BRIEF_PRESETS.map((t) => (
        <SelectCard
          key={t.id}
          item={t}
          selected={template}
          onSelect={(id) => setTemplate(id as BriefPresetId)}
        />
      ))}
    </div>,

    // Step 4: Review + create
    <div key="s4" style={{ display: 'flex', flexDirection: 'column', gap: 0, animation: 'fadeUp 0.35s cubic-bezier(0.16,1,0.3,1) both' }}>
      {creating ? (
        /* ── Scaffold log ── */
        <div>
          <div style={{ fontSize: 10, fontFamily: T.mono, color: T.text2, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
            Scaffolding Project
          </div>
          <div
            ref={logRef}
            style={{
              background: T.bg2,
              border: `1px solid ${T.border}`,
              borderRadius: 5,
              padding: '12px 14px',
              height: 200,
              overflowY: 'auto',
              fontFamily: T.mono,
              fontSize: 11,
            }}
          >
            {logLines.map((line, i) => (
              <div
                key={i}
                style={{
                  color: i === logLines.length - 1 && !logDone ? T.text0 : T.text2,
                  marginBottom: 5,
                  lineHeight: 1.5,
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                }}
              >
                <span style={{ color: T.green, flexShrink: 0 }}>
                  {i < logLines.length - 1 || logDone ? '✓' : '›'}
                </span>
                {line}
              </div>
            ))}
            {!logDone && (
              <div style={{ display: 'flex', gap: 6, color: T.text3 }}>
                <span style={{ animation: 'pulse 2s ease-in-out infinite' }}>▌</span>
              </div>
            )}
          </div>

          {logDone && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: T.green, boxShadow: `0 0 8px ${T.green}` }} />
                <span style={{ fontSize: 13, fontWeight: 500, color: T.green }}>Project ready — {name}</span>
              </div>
              <button
                onClick={() => {
                  const preset = BRIEF_PRESETS.find((p) => p.id === template);
                  onCreate({ name, path, engine, provider, model, template, brief: preset?.brief ?? '' });
                }}
                style={{
                  width: '100%',
                  padding: '11px 0',
                  background: T.accent,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 5,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: T.sans,
                }}
              >
                Open in Workspace →
              </button>
            </div>
          )}
        </div>
      ) : (
        /* ── Review table ── */
        (() => {
          const engineLabel  = ENGINES.find((e) => e.id === engine)?.label ?? engine;
          const providerLabel = PROVIDERS.find((p) => p.id === provider)?.label ?? provider;
          const modelLabel   = PROVIDERS.find((p) => p.id === provider)?.models.find((m) => m.id === model)?.label ?? model;
          const themeLabel   = BRIEF_PRESETS.find((p) => p.id === template)?.label ?? template;

          const rows: [string, string, string | null][] = [
            ['Project',   name || '—',                        null],
            ['Directory', path,                               T.mono],
            ['Engine',    engineLabel,                        null],
            ['Provider',  `${providerLabel} · ${modelLabel}`, T.mono],
            ['Theme',     themeLabel,                         null],
          ];

          return (
            <div>
              {rows.map(([k, v, font], i, arr) => (
                <div
                  key={k}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '11px 14px',
                    background: i % 2 === 0 ? T.bg2 : T.bg3,
                    borderTop:    i === 0             ? `1px solid ${T.border}` : 'none',
                    borderBottom: `1px solid ${T.border}`,
                    borderLeft:   `1px solid ${T.border}`,
                    borderRight:  `1px solid ${T.border}`,
                    borderRadius: i === 0             ? '5px 5px 0 0'
                                : i === arr.length - 1 ? '0 0 5px 5px'
                                : 0,
                  }}
                >
                  <span style={{ fontSize: 11, fontFamily: T.mono, color: T.text2 }}>{k}</span>
                  <span style={{ fontSize: 11, fontFamily: font ?? T.sans, color: T.text1 }}>{v}</span>
                </div>
              ))}
            </div>
          );
        })()
      )}
    </div>,
  ];

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: T.bg0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}
    >
      {/* Grid background */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          backgroundImage: `linear-gradient(${T.border} 1px, transparent 1px), linear-gradient(90deg, ${T.border} 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
          opacity: 0.35,
          maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)',
        }}
      />

      <div style={{ width: 520, position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ marginBottom: 28, animation: 'fadeUp 0.35s cubic-bezier(0.16,1,0.3,1) both' }}>
          <button
            onClick={onBack}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              color: T.text2,
              fontSize: 11,
              fontFamily: T.mono,
              marginBottom: 18,
              padding: 0,
            }}
          >
            ← Back
          </button>
          <div
            style={{
              fontFamily: T.mono,
              fontSize: 10,
              letterSpacing: '0.28em',
              color: T.accent,
              marginBottom: 8,
              textTransform: 'uppercase',
            }}
          >
            New Game Project
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 300,
              color: T.text0,
              letterSpacing: '-0.02em',
            }}
          >
            {STEP_TITLES[step]}
          </div>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 24, alignItems: 'center' }}>
          {STEP_LABELS.map((label, i) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, flex: i < STEP_LABELS.length - 1 ? 'none' : undefined }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    flexShrink: 0,
                    background: i < step ? T.accentLo : i === step ? T.accent : T.bg3,
                    border: `1px solid ${i <= step ? T.accent : T.border2}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 9,
                    fontFamily: T.mono,
                    fontWeight: 600,
                    color: i < step ? T.accent : i === step ? '#fff' : T.text3,
                    transition: 'all 0.2s',
                  }}
                >
                  {i < step ? '✓' : i + 1}
                </div>
                <span style={{ fontSize: 10, fontFamily: T.mono, color: i === step ? T.text1 : T.text3 }}>
                  {label}
                </span>
              </div>
              {i < STEP_LABELS.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    width: 28,
                    height: 1,
                    background: i < step ? T.accent + '44' : T.border,
                    marginLeft: 6,
                  }}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div style={{ minHeight: 240 }}>{stepContent[step]}</div>

        {/* Navigation — hidden once scaffold is running */}
        {!creating && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28 }}>
            <button
              onClick={() => (step > 0 ? setStep((s) => s - 1) : onBack())}
              style={{
                padding: '8px 18px',
                background: 'transparent',
                color: T.text2,
                border: `1px solid ${T.border2}`,
                borderRadius: 4,
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: T.sans,
              }}
            >
              {step === 0 ? 'Cancel' : '← Back'}
            </button>

            {step < 4 ? (
              <button
                onClick={() => setStep((s) => s + 1)}
                disabled={!canNext}
                style={{
                  padding: '8px 22px',
                  background: canNext ? T.accent : T.bg4,
                  color: canNext ? '#fff' : T.text3,
                  border: 'none',
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: canNext ? 'pointer' : 'default',
                  fontFamily: T.sans,
                  transition: 'background 0.15s',
                }}
              >
                Continue →
              </button>
            ) : (
              <button
                onClick={startCreate}
                style={{
                  padding: '8px 22px',
                  background: T.accent,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: T.sans,
                }}
              >
                Create Project
              </button>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
