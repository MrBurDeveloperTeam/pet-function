import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createMeowLinePicker, resolveMeowCycle, validateMeowText } from './meowDialogue.mjs';
import type { MeowConfiguration, MeowPreset, MeowPresetController, MeowPresetRepository, MeowState } from './meowTypes';

const EMPTY: MeowConfiguration = { presets: [], timing: {} };
const CHANNEL = 'snabbb-cat-sayings';
type Snapshot = { owner: string | null; status: MeowPresetController['status']; config: MeowConfiguration };

/** The single text-only ambient loop. Business dialogue and audio keep their owners. */
export function useMeowDialogue({ repository, ownerId, active, blocked, states }: {
  repository: MeowPresetRepository;
  ownerId: string | null;
  active: boolean;
  blocked: boolean;
  states: readonly string[];
}): { message: string | null; controller: MeowPresetController } {
  const [snapshot, setSnapshot] = useState<Snapshot>({ owner: null, status: 'loading', config: EMPTY });
  const [fault, setFault] = useState<{ owner: string; message: string } | null>(null);
  const [pendingOwner, setPendingOwner] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ owner: string; open: boolean } | null>(null);
  const [line, setLine] = useState<{ owner: string; text: string } | null>(null);
  const identity = useRef({ ownerId, repository, active, editing: false });
  const generation = useRef(0);
  const readVersion = useRef(0);
  const busy = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const picker = useRef(createMeowLinePicker());
  const editing = !!ownerId && editor?.owner === ownerId && editor.open && active;
  identity.current = { ownerId, repository, active, editing };
  const config = snapshot.owner === ownerId ? snapshot.config : EMPTY;
  const status = snapshot.owner === ownerId ? snapshot.status : 'loading';

  useLayoutEffect(() => {
    generation.current += 1;
    readVersion.current += 1;
    busy.current = false;
    picker.current = createMeowLinePicker();
    setPendingOwner(null);
    setFault(null);
    setEditor(null);
    setLine(null);
    setSnapshot({ owner: ownerId, status: 'loading', config: EMPTY });
    return () => { generation.current += 1; readVersion.current += 1; };
  }, [active, ownerId, repository]);

  const isCurrent = useCallback((owner: string, version: number) => (
    generation.current === version && identity.current.ownerId === owner
    && identity.current.repository === repository && identity.current.active
  ), [repository]);

  const reload = useCallback(async () => {
    if (!ownerId || !active || busy.current) return;
    const version = generation.current;
    const request = ++readVersion.current;
    try {
      const loaded = await repository.load(ownerId);
      if (!isCurrent(ownerId, version) || request !== readVersion.current) return;
      setSnapshot({ owner: ownerId, status: 'ready', config: loaded });
      setFault(null);
    } catch (error) {
      if (!isCurrent(ownerId, version) || request !== readVersion.current) return;
      setSnapshot({ owner: ownerId, status: 'error', config: EMPTY });
      if ((error as { code?: string })?.code === 'MEOW_AUTH_MISMATCH') setEditor(null);
      setFault({ owner: ownerId, message: 'Your sayings could not be loaded. Your cat can still use its built-in sayings. Please retry.' });
    }
  }, [active, isCurrent, ownerId, repository]);

  useEffect(() => {
    if (!ownerId || !active) return;
    void reload();
    const refresh = () => {
      if (document.visibilityState === 'visible' && !identity.current.editing) void reload();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const interval = window.setInterval(refresh, 60_000);
    const localChannel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL);
    channel.current = localChannel;
    if (localChannel) localChannel.onmessage = event => {
      if (event.data?.ownerId === ownerId && !identity.current.editing) void reload();
    };
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      clearInterval(interval);
      localChannel?.close();
      if (channel.current === localChannel) channel.current = null;
    };
  }, [active, ownerId, reload]);

  const mutate = useCallback(async (
    operation: () => Promise<MeowPreset | void>,
    apply: (presets: MeowPreset[], receipt: MeowPreset | void) => MeowPreset[],
  ): Promise<boolean> => {
    if (!ownerId || !active || busy.current || status !== 'ready') return false;
    const version = generation.current;
    busy.current = true;
    readVersion.current += 1;
    setPendingOwner(ownerId);
    setFault(null);
    try {
      const receipt = await operation();
      if (!isCurrent(ownerId, version)) return false;
      setSnapshot(previous => previous.owner !== ownerId ? previous : {
        ...previous, config: { ...previous.config, presets: apply(previous.config.presets, receipt) },
      });
      channel.current?.postMessage({ ownerId });
      return true;
    } catch (error) {
      if (isCurrent(ownerId, version)) {
        if ((error as { code?: string })?.code === 'MEOW_AUTH_MISMATCH') {
          setSnapshot({ owner: ownerId, status: 'error', config: EMPTY });
          setEditor(null);
        }
        setFault({ owner: ownerId, message: (error as { code?: string })?.code === 'MEOW_PRESET_CONFLICT'
          ? 'This saying changed in another editor. Reload your sayings and compare your text before saving again.'
          : 'Your change was not confirmed. Keep your text and retry, or reload your sayings to check the saved version.' });
      }
      return false;
    } finally {
      if (isCurrent(ownerId, version)) {
        busy.current = false;
        setPendingOwner(null);
      }
    }
  }, [active, isCurrent, ownerId, status]);

  const add = useCallback(async (state: MeowState, text: string) => {
    let value: string;
    try { value = validateMeowText(text); } catch { return false; }
    return mutate(() => repository.add(ownerId!, state, value), (presets, receipt) => (
      receipt ? [...presets.filter(item => item.id !== receipt.id), receipt] : presets
    ));
  }, [mutate, ownerId, repository]);
  const update = useCallback(async (id: string, text: string, expectedText?: string) => {
    let value: string;
    try { value = validateMeowText(text); } catch { return false; }
    return mutate(() => repository.update(ownerId!, id, value, expectedText), (presets, receipt) => (
      receipt ? presets.map(item => item.id === id ? receipt : item) : presets
    ));
  }, [mutate, ownerId, repository]);
  const remove = useCallback((id: string, expectedText?: string) => mutate(
    () => repository.remove(ownerId!, id, expectedText), presets => presets.filter(item => item.id !== id),
  ), [mutate, ownerId, repository]);
  const setEditing = useCallback((open: boolean) => {
    if (!ownerId || !active) return;
    setEditor({ owner: ownerId, open });
    if (open) void reload();
  }, [active, ownerId, reload]);

  const statesKey = states.join('|');
  // Background refreshes must not restart a long interval when its values did not change.
  const cycleKey = JSON.stringify(resolveMeowCycle(config, statesKey.split('|')));
  const cycle = useMemo(() => JSON.parse(cycleKey) as ReturnType<typeof resolveMeowCycle>, [cycleKey]);
  useEffect(() => {
    setLine(null);
    if (!ownerId || !active || blocked || editing || !cycle) return;
    let cancelled = false;
    let showTimer: ReturnType<typeof setTimeout>;
    let hideTimer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      showTimer = setTimeout(() => {
        if (cancelled) return;
        const text = picker.current(cycle.lines);
        if (text) setLine({ owner: ownerId, text });
        hideTimer = setTimeout(() => {
          if (cancelled) return;
          setLine(null);
          schedule();
        }, cycle.durationMs);
      }, cycle.intervalMs);
    };
    schedule();
    return () => { cancelled = true; clearTimeout(showTimer); clearTimeout(hideTimer); };
  }, [active, blocked, cycle, editing, ownerId]);

  return {
    message: active && !blocked && !editing && line?.owner === ownerId ? line.text : null,
    controller: {
      ownerId: active ? ownerId : null, status, presets: config.presets,
      pending: !!ownerId && pendingOwner === ownerId, error: fault?.owner === ownerId ? fault.message : null,
      editing, setEditing, reload, add, update, remove,
    },
  };
}
