'use client';
import React, { useState } from 'react';
import { Modal, RatingSlider } from './ui';
import { Mark, ratingColor } from './Icon';
import { useLibrary } from '@/lib/store';
import type { Book } from '@/lib/types';
import { daysBetween } from '@/lib/util';

/** Shown when a book is marked Completed: rate it and keep a one-line takeaway. */
export function CompleteDialog({ book, onClose }: { book: Book; onClose: () => void }) {
  const { updateBook, createNote, goals, live } = useLibrary();
  const [rating, setRating] = useState<number | null>(book.rating);
  const [takeaway, setTakeaway] = useState('');
  const now = new Date();
  const year = now.getFullYear();
  const done = live.filter((b) => b.status === 'completed' && b.completed_at && new Date(b.completed_at).getFullYear() === year && b.id !== book.id).length + 1;
  const goal = goals.find((g) => g.year === year && g.month == null);
  const days = daysBetween(book.started_at, now.toISOString());

  const save = async () => {
    await updateBook(book.id, { status: 'completed', completed_at: now.toISOString(), rating, read_next_pos: null, progress: book.file_path ? 1 : book.progress, started_at: book.started_at || now.toISOString() });
    if (takeaway.trim()) await createNote({ book_id: book.id, title: 'Takeaway', body: takeaway.trim() });
    onClose();
  };

  return (
    <Modal title="Completed" onClose={onClose} width={460} footer={<><span className="grow" /><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn pri" onClick={save}>Mark as completed</button></>}>
      <div className="col" style={{ alignItems: 'center', gap: 10, padding: '6px 0 4px', textAlign: 'center' }}>
        <Mark size={56} color={rating == null ? 'var(--primary)' : ratingColor(rating)} />
        <div className="serif" style={{ fontSize: 20 }}>{book.title}</div>
        <span className="cap" style={{ fontSize: 13 }}>
          {days ? `${days} ${days === 1 ? 'day' : 'days'} · ` : ''}{goal ? `${done} of ${goal.target} books this year` : `Book ${done} this year`}
        </span>
      </div>
      <div className="field"><span>How was it?</span><RatingSlider value={rating} onChange={setRating} /></div>
      <label className="field"><span>One-line takeaway (saved as a note)</span><input className="text-input" value={takeaway} onChange={(e) => setTakeaway(e.target.value)} placeholder="What will you remember?" /></label>
    </Modal>
  );
}
