import Dexie, { type EntityTable } from 'dexie';
import type { Card as FsrsCard } from 'ts-fsrs';
import type { Attempt, RemediationEntry } from '../content/types';

export interface Profile {
  id: 'me';
  theta: number;
  answered: number;
  placementDone: boolean;
  thetaHistory: { at: number; theta: number }[];
}

export interface StoredCard {
  lexemeId: string;
  card: FsrsCard;
}

export interface StoredAttempt extends Attempt {
  seq?: number;
}

export const db = new Dexie('amirnet') as Dexie & {
  profile: EntityTable<Profile, 'id'>;
  cards: EntityTable<StoredCard, 'lexemeId'>;
  attempts: EntityTable<StoredAttempt, 'seq'>;
  remediation: EntityTable<RemediationEntry & { key: string }, 'key'>;
};

db.version(1).stores({
  profile: 'id',
  cards: 'lexemeId',
  attempts: '++seq, at, questionId',
  remediation: 'key, cause, targetId',
});
