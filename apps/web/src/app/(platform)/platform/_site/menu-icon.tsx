import {
  BookOpenIcon,
  BriefcaseBusinessIcon,
  CalendarIcon,
  ClipboardListIcon,
  CodeXmlIcon,
  CreditCardIcon,
  FileTextIcon,
  GitCompareArrowsIcon,
  GraduationCapIcon,
  HistoryIcon,
  MailCheckIcon,
  MessagesSquareIcon,
  PaletteIcon,
  PlugIcon,
  RocketIcon,
  ServerIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UserRoundSearchIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import type { MenuIcon as MenuIconName } from "../site";

const ICONS: Record<MenuIconName, LucideIcon> = {
  booking: CalendarIcon,
  briefing: FileTextIcon,
  recap: SparklesIcon,
  "follow-up": MailCheckIcon,
  payment: CreditCardIcon,
  integrations: PlugIcon,
  trust: ShieldCheckIcon,
  compare: GitCompareArrowsIcon,
  consultants: BriefcaseBusinessIcon,
  coaches: MessagesSquareIcon,
  agencies: ClipboardListIcon,
  teams: UsersIcon,
  hiring: UserRoundSearchIcon,
  programs: GraduationCapIcon,
  docs: BookOpenIcon,
  start: RocketIcon,
  api: CodeXmlIcon,
  "self-host": ServerIcon,
  changelog: HistoryIcon,
  press: PaletteIcon,
};

/** The outline icon of a menu item, in a Peach tile as the concepts draw feature icons. */
export function MenuIcon({ name, className = "" }: { name: MenuIconName; className?: string }) {
  const Icon = ICONS[name];
  return (
    <span
      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-(--brand) ${className}`}
      aria-hidden
    >
      <Icon className="size-[18px]" />
    </span>
  );
}
