import { useEffect, useRef, useState } from 'react';
import { trpc } from '@renderer/lib/trpc';
import { waitForStudioPort } from '@renderer/lib/port';
import type { ScaffoldLogEvent, ScaffoldDoneEvent, ScaffoldErrorEvent } from '@shared/protocol';

interface NewProjectWizardProps {
  onBack: () => void;
  onCreate: (details: { name: string; projectId: string; path: string; engine: EngineId; provider: ProviderId; model: string; template: BriefPresetId; brief: string }) => void;
}

const STEP_LABELS = ['Project', 'Engine', 'AI', 'Template', 'Brief', 'Review'] as const;
const STEP_TITLES = [
  'Name your project',
  'Choose an engine',
  'Set up AI',
  'Pick a template',
  'Refine the brief',
  'Review & create',
];

const BRIEF_MIN_CHARS = 20;

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
  const active = selected === item.id;
  const disabled = item.disabled === true;
  return (
    <div
      onClick={() => { if (!disabled) onSelect(item.id); }}
      className={[
        'flex gap-3 rounded-[5px] border p-[12px_14px] transition-all duration-[120ms]',
        wide ? 'items-center' : 'items-start',
        disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
        active
          ? 'bg-accent-lo border-[#4d9eff77]'
          : 'bg-surface-2 border-border-1 hover:bg-surface-3 hover:border-border-2',
      ].join(' ')}
    >
      <div
        className={[
          'flex h-7 w-7 shrink-0 items-center justify-center rounded border text-13',
          active ? 'bg-accent-lo border-[#4d9eff55] text-accent' : 'bg-surface-4 border-border-2 text-fg-2',
        ].join(' ')}
      >
        {item.icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className={`mb-0.5 text-xs font-medium ${active ? 'text-fg-0' : 'text-fg-1'}`}>
          {item.label}
        </div>
        <div className="font-mono text-10 leading-[1.4] text-fg-2">
          {item.sub}
        </div>
      </div>
      {disabled && (
        <span className="shrink-0 rounded-[3px] border border-border-2 px-1.5 py-0.5 font-mono text-9 text-fg-3">
          soon
        </span>
      )}
      {active && !disabled && (
        <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
      )}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="mb-[7px] font-mono text-10 uppercase tracking-[0.1em] text-fg-2">
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
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={[
        'w-full rounded border border-border-2 bg-surface-2 px-3 py-[9px] text-xs text-fg-0 outline-none transition-colors duration-150 focus:border-[#4d9eff99]',
        mono ? 'font-mono' : 'font-sans',
      ].join(' ')}
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
  const [brief, setBrief] = useState<string>(
    BRIEF_PRESETS.find((p) => p.id === 'dark-fantasy')?.brief ?? '',
  );
  const [creating, setCreating] = useState(false);

  const handleTemplateChange = (id: BriefPresetId): void => {
    setTemplate(id);
    setBrief(BRIEF_PRESETS.find((p) => p.id === id)?.brief ?? '');
  };
  const [logLines, setLogLines] = useState<Array<{ text: string; final: boolean }>>([]);
  const [logDone, setLogDone] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [scaffoldResult, setScaffoldResult] = useState<{ projectId: string; path: string; gameTitle: string } | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const chooseDirectory = trpc.runtime.chooseDirectory.useMutation();
  const scaffoldMutation = trpc.projects.scaffold.useMutation();

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
    setLogError(null);
    setScaffoldResult(null);

    let jobId: string | null = null;
    let port: MessagePort | null = null;

    const handleMessage = (event: MessageEvent): void => {
      const data = event.data as { type?: string; jobId?: string } | null;
      if (data === null || data === undefined || data.jobId !== jobId) return;

      if (data.type === 'scaffold-log') {
        const e = data as ScaffoldLogEvent;
        setLogLines((prev) => [...prev, { text: e.line, final: e.done }]);
      } else if (data.type === 'scaffold-done') {
        const e = data as ScaffoldDoneEvent;
        setLogDone(true);
        setScaffoldResult({ projectId: e.projectId, path: e.path, gameTitle: e.gameTitle });
        if (port !== null) port.removeEventListener('message', handleMessage);
      } else if (data.type === 'scaffold-error') {
        const e = data as ScaffoldErrorEvent;
        setLogError(e.message);
        if (port !== null) port.removeEventListener('message', handleMessage);
      }
    };

    void waitForStudioPort().then((p) => {
      port = p;
      port.addEventListener('message', handleMessage);
    });

    scaffoldMutation.mutate(
      { name, path, brief },
      {
        onSuccess: (result) => { jobId = result.jobId; },
        onError: (err) => {
          setLogError(err.message);
          if (port !== null) port.removeEventListener('message', handleMessage);
        },
      },
    );
  };

  const canNext = [
    name.trim().length > 0,
    true,
    true,
    true,
    brief.trim().length >= BRIEF_MIN_CHARS,
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
    <div key="s0" className="flex animate-fade-up flex-col gap-[18px]">
      <div>
        <FieldLabel>Project Name</FieldLabel>
        <TextInput value={name} onChange={setName} placeholder="My Awesome Game" />
      </div>
      <div>
        <FieldLabel>Directory</FieldLabel>
        <div className="flex gap-2">
          <div className="flex-1">
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
            className={`cursor-pointer whitespace-nowrap rounded border border-border-2 bg-surface-3 px-[14px] font-mono text-11 text-fg-1 ${chooseDirectory.isPending ? 'opacity-60' : ''}`}
          >
            Browse…
          </button>
        </div>
        <div className="mt-[5px] font-mono text-10 text-fg-2">
          The folder will be created if it doesn't exist.
        </div>
      </div>
    </div>,

    // Step 1: Engine
    <div key="s1" className="flex animate-fade-up flex-col gap-2">
      {ENGINES.map((e) => (
        <SelectCard key={e.id} item={e} selected={engine} onSelect={(id) => setEngine(id as EngineId)} wide />
      ))}
    </div>,

    // Step 2: AI provider + model
    <div key="s2" className="flex animate-fade-up flex-col gap-[18px]">
      <div>
        <FieldLabel>Provider</FieldLabel>
        <div className="flex flex-col gap-1.5">
          {PROVIDERS.map((p) => (
            <div
              key={p.id}
              onClick={() => {
                setProvider(p.id);
                setModel(p.models[0].id);
              }}
              className={[
                'flex cursor-pointer items-center gap-2.5 rounded-[5px] border px-3 py-2.5 transition-all duration-[120ms]',
                provider === p.id ? 'bg-accent-lo border-[#4d9eff66]' : 'bg-surface-2 border-border-1',
              ].join(' ')}
            >
              <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${provider === p.id ? 'bg-accent' : 'bg-fg-3'}`} />
              <span className={`flex-1 text-xs font-medium ${provider === p.id ? 'text-fg-0' : 'text-fg-1'}`}>
                {p.label}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <FieldLabel>Model</FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          {PROVIDERS.find((p) => p.id === provider)?.models.map((m) => (
            <button
              key={m.id}
              onClick={() => setModel(m.id)}
              className={[
                'cursor-pointer rounded border px-3 py-[5px] font-mono text-11 transition-all duration-[120ms]',
                model === m.id
                  ? 'bg-accent-lo border-[#4d9eff55] text-accent'
                  : 'bg-surface-3 border-border-2 text-fg-1',
              ].join(' ')}
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
      className="grid animate-fade-up grid-cols-2 gap-2"
    >
      {BRIEF_PRESETS.map((t) => (
        <SelectCard
          key={t.id}
          item={t}
          selected={template}
          onSelect={(id) => handleTemplateChange(id as BriefPresetId)}
        />
      ))}
    </div>,

    // Step 4: Brief — editable textarea, prefilled from template (or empty for custom)
    (() => {
      const preset = BRIEF_PRESETS.find((p) => p.id === template);
      const isCustom = template === 'custom';
      const trimmed = brief.trim().length;
      const valid = trimmed >= BRIEF_MIN_CHARS;
      return (
        <div key="s4" className="flex animate-fade-up flex-col gap-[14px]">
          <div className="font-mono text-11 leading-[1.6] text-fg-2">
            {isCustom
              ? 'Describe your game in your own words — theme, mood, mechanics, art direction. The agent will use this brief to plan the full deckbuilder.'
              : `Edit the ${preset?.label ?? 'template'} brief below, or keep it as-is. The agent uses this brief verbatim to plan content and tone.`}
          </div>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder={isCustom ? 'A deckbuilder roguelike where…' : 'Edit the prefilled brief…'}
            className="w-full resize-y rounded border border-border-2 bg-surface-2 px-3 py-2.5 font-sans text-xs leading-[1.55] text-fg-0 outline-none"
            style={{ minHeight: 200 }}
          />
          <div className="flex justify-between font-mono text-10">
            <span className={valid ? 'text-fg-2' : 'text-[#d97777]'}>
              {valid ? 'Looks good.' : `At least ${BRIEF_MIN_CHARS} characters needed`}
            </span>
            <span className="text-fg-3">{trimmed} / {BRIEF_MIN_CHARS}+ chars</span>
          </div>
        </div>
      );
    })(),

    // Step 5: Review + create
    <div key="s5" className="flex flex-col gap-0 animate-fade-up">
      {creating ? (
        /* ── Scaffold log ── */
        <div>
          <div className="mb-2.5 font-mono text-10 uppercase tracking-[0.1em] text-fg-2">
            Scaffolding Project
          </div>
          <div
            ref={logRef}
            className="overflow-y-auto rounded-[5px] border border-border-1 bg-surface-2 p-[12px_14px] font-mono text-11"
            style={{ height: 200 }}
          >
            {logLines.map((entry, i) => {
              const isLast = i === logLines.length - 1;
              const isActive = isLast && !logDone && logError === null;
              return (
                <div
                  key={i}
                  className={`mb-[5px] flex items-center gap-2 leading-[1.5] ${isActive ? 'text-fg-0' : 'text-fg-2'}`}
                >
                  <span className={`shrink-0 ${isActive ? 'text-accent' : 'text-success'}`}>
                    {isActive ? '›' : '✓'}
                  </span>
                  {entry.text}
                </div>
              );
            })}
            {logError !== null && (
              <div className="mt-2 whitespace-pre-wrap text-11 leading-[1.5] text-[#d97777]">
                ✗ {logError}
              </div>
            )}
            {!logDone && logError === null && (
              <div className="flex gap-1.5 text-fg-3">
                <span className="animate-blink">▌</span>
              </div>
            )}
          </div>

          {logDone && scaffoldResult !== null && (
            <div className="mt-4">
              <div className="mb-3 flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-success" style={{ boxShadow: '0 0 8px #3dca7e' }} />
                <span className="text-13 font-medium text-success">
                  Project ready — {scaffoldResult.gameTitle}
                </span>
              </div>
              <button
                onClick={() => {
                  onCreate({ name: scaffoldResult.gameTitle, projectId: scaffoldResult.projectId, path: scaffoldResult.path, engine, provider, model, template, brief });
                }}
                className="w-full cursor-pointer rounded-[5px] border-0 bg-accent py-[11px] font-sans text-13 font-medium text-white"
              >
                Open in Workspace →
              </button>
            </div>
          )}
          {logError !== null && (
            <div className="mt-4">
              <button
                onClick={startCreate}
                className="w-full cursor-pointer rounded-[5px] border border-border-2 bg-surface-3 py-[11px] font-sans text-13 font-medium text-fg-1"
              >
                Retry
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

          const rows: [string, string, boolean][] = [
            ['Project',   name || '—',                        false],
            ['Directory', path,                               true],
            ['Engine',    engineLabel,                        false],
            ['Provider',  `${providerLabel} · ${modelLabel}`, true],
            ['Theme',     themeLabel,                         false],
          ];
          const totalRows = rows.length + 1; // + brief row

          return (
            <div>
              {rows.map(([k, v, isMono], i) => (
                <div
                  key={k}
                  className={[
                    'flex items-center justify-between border-b border-l border-r border-border-1 px-[14px] py-[11px]',
                    i === 0 ? 'rounded-t-[5px] border-t' : '',
                    i % 2 === 0 ? 'bg-surface-2' : 'bg-surface-3',
                  ].join(' ')}
                >
                  <span className="font-mono text-11 text-fg-2">{k}</span>
                  <span className={`text-11 text-fg-1 ${isMono ? 'font-mono' : 'font-sans'}`}>{v}</span>
                </div>
              ))}
              <div
                className={[
                  'flex flex-col gap-2 rounded-b-[5px] border-b border-l border-r border-border-1 px-[14px] py-[11px]',
                  totalRows % 2 === 1 ? 'bg-surface-2' : 'bg-surface-3',
                ].join(' ')}
              >
                <span className="font-mono text-11 text-fg-2">Brief</span>
                <div className="max-h-[110px] overflow-y-auto rounded-[3px] border border-border-1 bg-surface-0 px-2.5 py-2 font-sans text-11 leading-[1.5] text-fg-1 whitespace-pre-wrap">
                  {brief.trim() ? brief : <span className="italic text-fg-3">—</span>}
                </div>
              </div>
            </div>
          );
        })()
      )}
    </div>,
  ];

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center bg-surface-0">
      {/* Grid background */}
      <div
        className="pointer-events-none absolute inset-0 opacity-35"
        style={{
          backgroundImage: 'linear-gradient(#1a1f30 1px, transparent 1px), linear-gradient(90deg, #1a1f30 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)',
        }}
      />

      <div className="relative flex w-[520px] flex-col">
        {/* Header */}
        <div className="mb-7 animate-fade-up">
          <button
            onClick={onBack}
            className="mb-[18px] flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 font-mono text-11 text-fg-2"
          >
            ← Back
          </button>
          <div className="mb-2 font-mono text-10 uppercase tracking-widest2 text-accent">
            New Game Project
          </div>
          <div className="text-2xl font-light tracking-[-0.02em] text-fg-0">
            {STEP_TITLES[step]}
          </div>
        </div>

        {/* Step indicator */}
        <div className="mb-6 flex items-center gap-1.5">
          {STEP_LABELS.map((label, i) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="flex items-center gap-1.5">
                <div
                  className={[
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border font-mono text-9 font-semibold transition-all duration-200',
                    i < step  ? 'bg-accent-lo border-accent text-accent'
                      : i === step ? 'bg-accent border-accent text-white'
                      : 'bg-surface-3 border-border-2 text-fg-3',
                  ].join(' ')}
                >
                  {i < step ? '✓' : i + 1}
                </div>
                <span className={`font-mono text-10 ${i === step ? 'text-fg-1' : 'text-fg-3'}`}>
                  {label}
                </span>
              </div>
              {i < STEP_LABELS.length - 1 && (
                <div
                  className={`ml-1.5 h-px w-7 ${i < step ? 'bg-[#4d9eff44]' : 'bg-border-1'}`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="min-h-[240px]">{stepContent[step]}</div>

        {/* Navigation — hidden once scaffold is running */}
        {!creating && (
          <div className="mt-7 flex justify-between">
            <button
              onClick={() => (step > 0 ? setStep((s) => s - 1) : onBack())}
              className="cursor-pointer rounded border border-border-2 bg-transparent px-[18px] py-2 font-sans text-xs text-fg-2"
            >
              {step === 0 ? 'Cancel' : '← Back'}
            </button>

            {step < 5 ? (
              <button
                onClick={() => setStep((s) => s + 1)}
                disabled={!canNext}
                className={[
                  'rounded border-0 px-[22px] py-2 font-sans text-xs font-medium transition-colors duration-150',
                  canNext ? 'cursor-pointer bg-accent text-white' : 'cursor-default bg-surface-4 text-fg-3',
                ].join(' ')}
              >
                Continue →
              </button>
            ) : (
              <button
                onClick={startCreate}
                className="cursor-pointer rounded border-0 bg-accent px-[22px] py-2 font-sans text-xs font-medium text-white"
              >
                Create Project
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
