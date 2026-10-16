'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, MessageCircle, Pencil, Plus, Trash2, X } from 'lucide-react';
import { DEFAULT_MEOW_LINES, MAX_MEOW_TEXT_LENGTH, MEOW_STATES, validateMeowText } from './meowDialogue.mjs';
import type { MeowPreset, MeowPresetController, MeowState } from './meowTypes';

/** The shared account-preset surface for the floating mascot in every mini app. */
export function MeowPresetEditor({ controller }: { controller: MeowPresetController }) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const addInput = useRef<HTMLTextAreaElement>(null);
  const editInput = useRef<HTMLTextAreaElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
  const cancelDeleteButton = useRef<HTMLButtonElement>(null);
  const rowButtons = useRef(new Map<string, HTMLButtonElement>());
  const focusAfterSave = useRef(false);
  const composing = useRef(false);
  const operation = useRef(false);
  const mounted = useRef(true);
  const [state, setState] = useState<MeowState>('Normal');
  const [drafts, setDrafts] = useState<Partial<Record<MeowState, string>>>({});
  const [edit, setEdit] = useState<MeowPreset | null>(null);
  const [editText, setEditText] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);
  const [validation, setValidation] = useState<{ field: 'add' | 'edit'; text: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const draft = drafts[state] ?? '';
  const busy = controller.pending || localBusy;
  const writable = Boolean(controller.ownerId) && controller.status === 'ready' && !busy && !discardOpen;
  const dirty = Object.values(drafts).some(value => Boolean(value)) || Boolean(edit && editText !== edit.text);
  const custom = useMemo(() => controller.presets.filter(preset => (
    preset.state === state && !DEFAULT_MEOW_LINES[preset.state].includes(preset.text)
  )), [controller.presets, state]);

  useLayoutEffect(() => {
    mounted.current = true;
    const element = dialog.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (element && !element.open) element.showModal();
    closeButton.current?.focus();
    return () => {
      mounted.current = false;
      element?.close();
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  useEffect(() => { if (edit) editInput.current?.focus(); }, [edit?.id]);
  useEffect(() => { if (discardOpen) keepButton.current?.focus(); }, [discardOpen]);
  useEffect(() => { if (deleteId) cancelDeleteButton.current?.focus(); }, [deleteId]);
  useEffect(() => {
    if (!busy && focusAfterSave.current) {
      focusAfterSave.current = false;
      addInput.current?.focus();
    }
  }, [busy]);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  const requestClose = () => {
    if (busy || operation.current) { setNotice('Wait for the current change to finish.'); return; }
    if (discardOpen) { setDiscardOpen(false); closeButton.current?.focus(); return; }
    if (dirty) { setDiscardOpen(true); return; }
    controller.setEditing(false);
  };

  const reload = async () => {
    if (operation.current || busy) return;
    operation.current = true;
    setLocalBusy(true);
    setActionError(null);
    try { await controller.reload(); }
    catch { if (mounted.current) setActionError('Could not load your sayings. Check your connection and retry.'); }
    finally { operation.current = false; if (mounted.current) setLocalBusy(false); }
  };

  const run = async (commit: () => Promise<boolean>, success: () => void, message: string) => {
    if (!writable || operation.current) return;
    operation.current = true;
    setLocalBusy(true);
    setActionError(null);
    setNotice('Saving…');
    try {
      if (await commit()) {
        if (!mounted.current) return;
        success();
        setNotice(message);
      } else if (mounted.current) {
        setNotice('');
        setActionError('The change was not saved. Your text is still here; try again.');
      }
    } catch {
      if (mounted.current) {
        setNotice('');
        setActionError('The change was not saved. Check your connection and try again.');
      }
    } finally {
      operation.current = false;
      if (mounted.current) setLocalBusy(false);
    }
  };

  const checkedText = (text: string, field: 'add' | 'edit') => {
    try {
      const clean = validateMeowText(text);
      if (DEFAULT_MEOW_LINES[state].includes(clean) || controller.presets.some(preset => (
        preset.state === state && preset.id !== (field === 'edit' ? edit?.id : undefined) && preset.text === clean
      ))) throw new Error('This state already has that saying. Write something different.');
      setValidation(null);
      return clean;
    } catch (error) {
      setValidation({ field, text: error instanceof Error ? error.message : 'Enter a saying.' });
      (field === 'add' ? addInput : editInput).current?.focus();
      return null;
    }
  };

  const addSaying = (event: FormEvent) => {
    event.preventDefault();
    if (composing.current || !writable) return;
    const text = checkedText(draft, 'add');
    if (!text) return;
    const targetState = state;
    void run(() => controller.add(targetState, text), () => {
      setDrafts(current => ({ ...current, [targetState]: '' }));
      focusAfterSave.current = true;
    }, 'Saying added.');
  };

  const saveEdit = (event: FormEvent) => {
    event.preventDefault();
    if (composing.current || !edit || !writable) return;
    const text = checkedText(editText, 'edit');
    if (!text) return;
    const targetId = edit.id;
    const originalText = edit.text;
    void run(() => controller.update(targetId, text, originalText), () => {
      setEdit(null);
      setEditText('');
      focusAfterSave.current = true;
    }, 'Saying updated.');
  };

  const selectState = (next: MeowState) => {
    if (busy || discardOpen) return;
    setState(next);
    setDeleteId(null);
    setValidation(null);
    setActionError(null);
  };

  const tabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.nativeEvent.isComposing) return;
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % MEOW_STATES.length;
    else if (event.key === 'ArrowLeft') next = (index + MEOW_STATES.length - 1) % MEOW_STATES.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = MEOW_STATES.length - 1;
    else return;
    event.preventDefault();
    selectState(MEOW_STATES[next]);
    dialog.current?.querySelector<HTMLButtonElement>(`[data-meow-tab="${next}"]`)?.focus();
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <dialog
      ref={dialog}
      className="snabbb-molar-experience molar-meow-editor"
      data-molar-theme="light"
      data-mascot-ignore="true"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      aria-busy={busy}
      onCancel={(event) => { event.preventDefault(); requestClose(); }}
      onClose={() => { if (mounted.current && dialog.current && !dialog.current.open) controller.setEditing(false); }}
      onClick={(event) => {
        event.stopPropagation();
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) requestClose();
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => { if (event.key === 'Escape') event.stopPropagation(); }}
    >
      <header className="molar-meow-editor__header">
        <span className="molar-meow-editor__mark" aria-hidden="true"><MessageCircle size={24} /></span>
        <div><h2 id={`${id}-title`}>Cat sayings</h2><p id={`${id}-description`}>Give your companion a few words of your own.</p></div>
        <button ref={closeButton} type="button" className="molar-meow-editor__icon" aria-label="Close cat sayings" onClick={requestClose}><X size={21} aria-hidden="true" /></button>
      </header>
      <div className="molar-meow-editor__tabs" role="tablist" aria-label="Cat state">
        {MEOW_STATES.map((item, index) => <button
          key={item} id={`${id}-tab-${index}`} type="button" role="tab" data-meow-tab={index}
          aria-selected={state === item} aria-controls={`${id}-panel`} tabIndex={state === item ? 0 : -1}
          disabled={busy || discardOpen} onClick={() => selectState(item)} onKeyDown={(event) => tabKey(event, index)}
        >{item}{Boolean(drafts[item]) || (edit?.state === item && editText !== edit.text) ? <span className="molar-meow-editor__draft-dot" aria-label="Unsaved text" /> : null}</button>)}
      </div>
      <div className="molar-meow-editor__scroll" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${MEOW_STATES.indexOf(state)}`} tabIndex={0}>
        {discardOpen && <section className="molar-meow-editor__confirmation" role="alert" aria-label="Unsaved sayings">
          <strong>Discard your unsaved text?</strong><p>Saved sayings will stay. Your unfinished text will be lost.</p>
          <div className="molar-meow-editor__actions"><button ref={keepButton} type="button" className="molar-meow-editor__button" onClick={() => setDiscardOpen(false)}>Keep editing</button><button type="button" className="molar-meow-editor__button molar-meow-editor__button--danger" onClick={() => controller.setEditing(false)}>Discard and close</button></div>
        </section>}
        {controller.status === 'loading' && <div className="molar-meow-editor__state" role="status"><span className="molar-meow-editor__loader" aria-hidden="true" />Loading your sayings…</div>}
        {(controller.error || actionError) && <div className="molar-meow-editor__error" role="alert"><p>{controller.error || actionError}</p>{controller.error && <button type="button" className="molar-meow-editor__button" disabled={busy || discardOpen} onClick={() => void reload()}>Retry loading</button>}</div>}
        {!controller.ownerId && <p className="molar-meow-editor__error" role="alert">Sign in again to change your sayings.</p>}
        <section className="molar-meow-editor__section" aria-labelledby={`${id}-custom-title`}>
          <div className="molar-meow-editor__section-heading"><h3 id={`${id}-custom-title`}>Your sayings</h3><span>{custom.length}</span></div>
          <p className="molar-meow-editor__help">When your cat feels {state.toLowerCase()}, it can randomly say these alongside its usual lines.</p>
          {edit?.state === state && !custom.some(preset => preset.id === edit.id) && <section className="molar-meow-editor__confirmation" aria-label="Recover unsaved edit">
            <p>This saying is not in the loaded list. Your unsaved edit is kept here.</p>
            <label htmlFor={`${id}-recover`}>Your unsaved edit</label>
            <textarea ref={editInput} id={`${id}-recover`} rows={4} value={editText} disabled={busy || discardOpen} onChange={event => setEditText(event.target.value)} style={{ resize: 'none' }} />
            <div className="molar-meow-editor__actions"><button type="button" className="molar-meow-editor__button" disabled={busy || discardOpen} onClick={() => { setDrafts(current => ({ ...current, [state]: editText })); setEdit(null); setEditText(''); setValidation(null); addInput.current?.focus(); }}>Move draft to new saying</button><button type="button" className="molar-meow-editor__button" disabled={busy || discardOpen} onClick={() => { setEdit(null); setEditText(''); setValidation(null); addInput.current?.focus(); }}>Discard edit</button></div>
          </section>}
          {controller.status === 'ready' && custom.length === 0 && <p className="molar-meow-editor__empty">No personal sayings for this state yet. Add your first one below.</p>}
          <ul className="molar-meow-editor__list">
            {custom.map(preset => <li key={preset.id}>
              {edit?.id === preset.id ? <form noValidate className="molar-meow-editor__edit-form" onSubmit={saveEdit}>
                <label htmlFor={`${id}-edit`}>Edit saying</label>
                <textarea ref={editInput} id={`${id}-edit`} rows={4} value={editText} disabled={!writable}
                  aria-invalid={validation?.field === 'edit'} aria-describedby={`${id}-edit-count${validation?.field === 'edit' ? ` ${id}-edit-error` : ''}`}
                  style={{ resize: 'none' }} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
                  onChange={(event) => { setEditText(event.target.value); if (!composing.current) setValidation(null); }} />
                <span className="molar-meow-editor__count" id={`${id}-edit-count`}>{Array.from(editText).length} / {MAX_MEOW_TEXT_LENGTH}</span>
                {edit.text !== preset.text && <div className="molar-meow-editor__confirmation" role="status"><p>The saved version changed: {preset.text}</p><button type="button" className="molar-meow-editor__button" disabled={!writable} onClick={() => setEdit(preset)}>Keep my draft and use this saved version</button></div>}
                {validation?.field === 'edit' && <p className="molar-meow-editor__field-error" id={`${id}-edit-error`} role="alert">{validation.text}</p>}
                <div className="molar-meow-editor__actions"><button type="button" className="molar-meow-editor__button" disabled={busy || discardOpen} onClick={() => { setEdit(null); setEditText(''); setValidation(null); addInput.current?.focus(); }}>Cancel edit</button><button type="submit" className="molar-meow-editor__button molar-meow-editor__button--primary" disabled={!writable}><Check size={16} aria-hidden="true" />Save saying</button></div>
              </form> : <><p className="molar-meow-editor__saved-text">{preset.text}</p><div className="molar-meow-editor__row-actions"><button type="button" className="molar-meow-editor__icon" aria-label={`Edit saying: ${preset.text}`} disabled={!writable || Boolean(edit)} onClick={() => { setEdit(preset); setEditText(preset.text); setDeleteId(null); setValidation(null); }}><Pencil size={16} aria-hidden="true" /></button><button ref={(element) => { if (element) rowButtons.current.set(preset.id, element); else rowButtons.current.delete(preset.id); }} type="button" className="molar-meow-editor__icon" aria-label={`Delete saying: ${preset.text}`} disabled={!writable || Boolean(edit)} onClick={() => setDeleteId(preset.id)}><Trash2 size={16} aria-hidden="true" /></button></div></>}
              {deleteId === preset.id && <div className="molar-meow-editor__delete" role="group" aria-label="Confirm deletion"><p>Delete this saying? Your cat’s usual lines will stay.</p><div className="molar-meow-editor__actions"><button ref={cancelDeleteButton} type="button" className="molar-meow-editor__button" disabled={busy || discardOpen} onClick={() => { setDeleteId(null); rowButtons.current.get(preset.id)?.focus(); }}>Keep saying</button><button type="button" className="molar-meow-editor__button molar-meow-editor__button--danger" disabled={!writable} onClick={() => void run(() => controller.remove(preset.id, preset.text), () => { setDeleteId(null); focusAfterSave.current = true; }, 'Saying deleted.')}>Delete saying</button></div></div>}
            </li>)}
          </ul>
          <form noValidate className="molar-meow-editor__add-form" onSubmit={addSaying}>
            <label htmlFor={`${id}-add`}>Add a {state.toLowerCase()} saying</label>
            <textarea ref={addInput} id={`${id}-add`} rows={4} placeholder="What would your cat say?" value={draft} disabled={!writable}
              aria-invalid={validation?.field === 'add'} aria-describedby={`${id}-add-count${validation?.field === 'add' ? ` ${id}-add-error` : ''}`}
              style={{ resize: 'none' }} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
              onChange={(event) => { setDrafts(current => ({ ...current, [state]: event.target.value })); if (!composing.current) setValidation(null); }} />
            <div className="molar-meow-editor__form-footer"><span className="molar-meow-editor__count" id={`${id}-add-count`}>{Array.from(draft).length} / {MAX_MEOW_TEXT_LENGTH} characters</span><button type="submit" className="molar-meow-editor__button molar-meow-editor__button--primary" disabled={!writable}><Plus size={16} aria-hidden="true" />Add saying</button></div>
            {validation?.field === 'add' && <p className="molar-meow-editor__field-error" id={`${id}-add-error`} role="alert">{validation.text}</p>}
          </form>
        </section>
        <section className="molar-meow-editor__section molar-meow-editor__builtins" aria-labelledby={`${id}-builtin-title`}>
          <div className="molar-meow-editor__section-heading"><h3 id={`${id}-builtin-title`}>Usual sayings</h3><span>Always kept</span></div>
          <ul>{DEFAULT_MEOW_LINES[state].map(text => <li key={text}>{text}</li>)}</ul>
        </section>
      </div>
      <footer className="molar-meow-editor__footer"><p role="status" aria-live="polite">{notice || 'Your saved sayings follow you across the mini apps.'}</p><button type="button" className="molar-meow-editor__button" onClick={requestClose}>Done</button></footer>
    </dialog>, document.body,
  );
}
