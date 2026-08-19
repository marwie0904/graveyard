import {
  Moon, Coffee, Sun, Heart, Clock, Check, Plus, Wind, Eye, Bed, Car,
  ArrowRight, ArrowLeft, X, Info, Pencil, User, Bell, Trophy, Target,
  FileText, Palette, Lock, Play, Drop, ForkKnife, CaretRight, CaretDown,
  Lightning, ArrowCounterClockwise, DownloadSimple, Question, SpeakerHigh, SpeakerSlash,
  ListChecks as ListChecksBase,
  ChartBar as ChartBarBase,
  Pulse as PulseBase,
  Footprints as FootprintsBase,
} from "@phosphor-icons/react";

export {
  Moon, Coffee, Sun, Heart, Clock, Check, Plus, Wind, Eye, Bed, Car,
  ArrowRight, ArrowLeft, X, Info, Pencil, User, Bell, Trophy, Target,
  FileText, Palette, Lock, Play, Drop, ForkKnife, CaretRight, CaretDown,
  Lightning, ArrowCounterClockwise, DownloadSimple, Question, SpeakerHigh, SpeakerSlash,
};

/* These four are structurally linear and turn into unreadable blobs at
   weight="fill", so they opt out of the global fill weight. */
export const ListChecks = (p) => <ListChecksBase weight="regular" {...p} />;
export const ChartBar   = (p) => <ChartBarBase   weight="regular" {...p} />;
export const Pulse      = (p) => <PulseBase      weight="regular" {...p} />;
export const Footprints = (p) => <FootprintsBase weight="regular" {...p} />;

/* without these the four render as "Anonymous" in React DevTools */
ListChecks.displayName = "ListChecks";
ChartBar.displayName = "ChartBar";
Pulse.displayName = "Pulse";
Footprints.displayName = "Footprints";
