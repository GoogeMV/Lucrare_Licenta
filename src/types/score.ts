/**
 * Model de date minimal pentru notele introduse pe portativ.
 * Acesta e primul nivel al modelului `Score` (Score → Part → Staff →
 * Measure → Voice → Note) — pentru moment lucrăm direct cu o listă de
 * note pe o singură voce/măsură, suficient pentru introducerea de note.
 */

export type Duration = "whole" | "half" | "quarter" | "eighth" | "sixteenth"

export type Step = "C" | "D" | "E" | "F" | "G" | "A" | "B"

/** Alterație aplicată unei înălțimi: bemol (♭), becar (♮) sau diez (♯) */
export type Accidental = "flat" | "natural" | "sharp"

export interface Pitch {
  step: Step
  octave: number
  /** Alterația curentă a notei, dacă există (afișată lângă capul notei) */
  accidental?: Accidental
  /** Coarda (1 = cea mai înaltă) pe care e fretată nota în TAB; absent = mapare
   *  automată (fret-ul cel mai mic). Doar pentru chitară; nu schimbă înălțimea. */
  string?: number
}

/** Tipul unei intrări pe portativ: notă (cu înălțime) sau pauză */
export type EntryType = "note" | "rest"

/**
 * Semn de expresie aplicat unei singure note (deasupra/dedesubtul capului).
 * Legato (legătura de expresie) leagă mai multe note și e o funcționalitate
 * separată — nu apare aici fiindcă nu se aplică unei singure note.
 */
export type Articulation = "staccato" | "accent" | "tenuto" | "marcato"

/**
 * Nuanță (dinamică) plasată pe o notă — afișată sub portativ (italic bold) și
 * aplicată la redare ca volum. Rămâne în vigoare până la următoarea nuanță,
 * ca în notația tipărită (deci se pune de obicei pe o singură notă, nu pe toate).
 */
export type Dynamic = "pp" | "p" | "mp" | "mf" | "f" | "ff"

export interface NoteEntry {
  id: string
  type: EntryType
  /**
   * Înălțimile intrării: una singură pentru o notă obișnuită, mai multe pentru
   * un acord (sortate ascendent). Pentru pauze, prima e doar poziția de afișare.
   */
  pitches: Pitch[]
  duration: Duration
  /** Punct de prelungire: durata crește cu jumătate (ex. pătrime cu punct = 1.5 timpi) */
  dotted?: boolean
  /** Semne de expresie aplicate notei (staccato, accent, tenuto…); absent dacă nu există */
  articulations?: Articulation[]
  /** Nuanța plasată pe această notă (rămâne în vigoare până la următoarea); absentă dacă nu există */
  dynamic?: Dynamic
  /** Silaba de versuri scrisă sub notă (o singură strofă); absentă dacă nu există.
   *  Pauzele nu poartă versuri — silabele se pun doar pe note. */
  lyric?: string
}

/**
 * Legătură de expresie (legato): o curbă care leagă două note, de la `fromId`
 * la `toId`. Spre deosebire de articulații, e o relație între note, deci e
 * modelată separat de `NoteEntry` (prin id-uri, ca să reziste la reordonări).
 */
export interface Slur {
  fromId: string
  toId: string
}

/** Cheia portativului — determină poziția înălțimilor pe linii */
export type Clef = "treble" | "bass" | "alto"

/** Modul de afișare al unui portativ de chitară: notație, tablatură sau ambele */
export type StaffDisplay = "notation" | "tab" | "both"

/**
 * Un portativ (o linie de instrument) din partitură: are propria cheie și
 * propriile note/legături. Armura și măsura sunt comune întregii partituri
 * (vezi `ScoreState`) și doar se desenează pe fiecare portativ.
 */
export interface Staff {
  id: string
  instrument: string
  clef: Clef
  /** Armura proprie a portativului (instrumentele transpozitorii pot diferi) */
  keySignature: KeySignature
  /**
   * Id-ul grupului (sistemului de pian) din care face parte portativul, dacă e
   * cazul. Portativele cu același `groupId` aparțin aceluiași instrument și sunt
   * legate printr-o acoladă (ex. pian: cheie sol + cheie fa).
   */
  groupId?: string
  /** Modul de afișare (doar chitare): notație / TAB / ambele. Absent = notație. */
  display?: StaffDisplay
  notes: NoteEntry[]
  slurs: Slur[]
}

/** Indicația de măsură: ex. 4/4 (numerator=4, denominator=4) sau 6/8 */
export interface TimeSignature {
  numerator: number
  denominator: number
}

/**
 * Armura, în formatul de cheie folosit de VexFlow ("C", "G", "Bb" …).
 * Modelul nostru păstrează alterațiile explicit pe fiecare notă; armura e
 * desenată la începutul portativului și aplicată la redare (înălțimi).
 */
export type KeySignature = string
