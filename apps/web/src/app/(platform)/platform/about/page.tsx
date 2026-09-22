import type { Metadata } from "next";
import Link from "next/link";
import { breadcrumbLd, JsonLd } from "../json-ld";
import { Prose } from "../prose";
import { pageMetadata, SITE } from "../site";

export const metadata: Metadata = pageMetadata({
  title: "About",
  description:
    "Why Bookly exists: scheduling was solved, the meeting itself was not. Who builds it, why it is open source under AGPL-3.0, and what it will never become.",
  path: "/about",
});

export default function AboutPage() {
  return (
    <Prose
      title="About Bookly"
      lede="Bookly started as a booking page and turned into the thing around the meeting."
    >
      <JsonLd data={breadcrumbLd([["About", "/about"]])} />
      <h2>The problem</h2>
      <p>
        If you make a living from conversations, scheduling was solved years ago. What is not solved
        is everything after the invite lands: remembering what the last call was about, taking notes
        while trying to listen, writing the follow-up at 11pm, and losing the one objection that
        decided the deal because nobody wrote it down.
      </p>
      <p>
        The tools that exist for that are built for sales teams with a CRM admin. Bookly is built
        for the person who is the whole team: the consultant, coach, advisor or small agency who
        books their own calls and keeps their own relationships.
      </p>
      <h2>What Bookly does</h2>
      <p>
        Scheduling is the entry point. Around it, Bookly keeps one record per person, briefs you
        before every call from that record, transcribes the call with consent when you use the
        built-in video, and turns the transcript into a recap you can act on in one click: tasks, a
        stage change, a follow-up email. Your calendar can tell the difference between a customer
        and a cold lead, and defend your focus time from the latter.
      </p>
      <h2>Open source, by design</h2>
      <p>
        Client conversations are the most sensitive data a small business has. That is why Bookly is
        released under the AGPL-3.0 and can run entirely on your own server, with transcripts and
        contacts in your own database and the AI features optional. The hosted version exists for
        people who would rather not run servers; it runs the same code.
      </p>
      <h2>Who builds it</h2>
      <p>
        Bookly is built by {SITE.operator}, an independent software engineer. It is developed in the
        open on{" "}
        <a href={SITE.github} target="_blank" rel="noreferrer">
          GitHub
        </a>
        , where the roadmap, issues and changelog live.
      </p>
      <h2>What it will not become</h2>
      <ul>
        <li>
          A tool that records people without telling them. Consent is a feature, not a setting.
        </li>
        <li>A CRM you need a consultant to configure. One record per person, and that is it.</li>
        <li>A lock-in. Export everything, self-host any time, delete what you want.</li>
      </ul>
      <p>
        Questions, ideas or a story about a meeting that went wrong?{" "}
        <Link href="/contact">Get in touch</Link>.
      </p>
    </Prose>
  );
}
