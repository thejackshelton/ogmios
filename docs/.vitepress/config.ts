import { defineConfig } from "vitepress";

/**
 * Shoki documentation site config.
 *
 * Nav mirrors the Phase 6 CONTEXT.md structure:
 *   Getting Started / Guides / API / Background
 *
 * Dark-mode default, local search, edit-this-page links, GitHub icon.
 */
export default defineConfig({
	title: "Shoki",
	description:
		"Run real screen readers — VoiceOver, NVDA, and more — in any test framework and any CI environment.",

	// Dark-mode-default theme.
	appearance: "dark",

	// Deployed at /shoki/ on GitHub Pages; override via DOCS_BASE env var for custom domains.
	base: process.env.DOCS_BASE ?? "/shoki/",

	cleanUrls: true,
	lastUpdated: true,

	head: [
		["link", { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" }],
		["meta", { name: "theme-color", content: "#646cff" }],
	],

	themeConfig: {
		logo: { src: "/logo.svg", alt: "Shoki" },

		// Local search — no external dependencies.
		search: {
			provider: "local",
		},

		// Edit-this-page links land on the repo's docs folder.
		editLink: {
			pattern: "https://github.com/shoki/shoki/edit/main/docs/:path",
			text: "Edit this page on GitHub",
		},

		socialLinks: [{ icon: "github", link: "https://github.com/shoki/shoki" }],

		nav: [
			{ text: "Getting Started", link: "/getting-started/install" },
			{ text: "Guides", link: "/guides/matchers" },
			{ text: "API", link: "/api/sdk" },
			{ text: "Background", link: "/background/architecture" },
			{
				text: "v0.1",
				items: [
					{
						text: "Changelog",
						link: "https://github.com/shoki/shoki/blob/main/CHANGELOG.md",
					},
					{
						text: "Contributing",
						link: "https://github.com/shoki/shoki/blob/main/CONTRIBUTING.md",
					},
				],
			},
		],

		sidebar: {
			"/getting-started/": [
				{
					text: "Getting Started",
					items: [
						{ text: "Install", link: "/getting-started/install" },
						{
							text: "Permission setup",
							link: "/getting-started/permission-setup",
						},
						{
							text: "Vitest quickstart",
							link: "/getting-started/vitest-quickstart",
						},
						{
							text: "CI quickstart",
							link: "/getting-started/ci-quickstart",
						},
					],
				},
			],

			"/guides/": [
				{
					text: "Guides",
					items: [
						{ text: "Matchers — semantic assertions", link: "/guides/matchers" },
						{
							text: "Migration from Guidepup",
							link: "/guides/migration-from-guidepup",
						},
						{ text: "Troubleshooting", link: "/guides/troubleshooting" },
					],
				},
				{
					text: "Running in CI",
					items: [
						{
							text: "Self-hosted tart",
							link: "/guides/ci/tart-selfhosted",
						},
						{ text: "Cirrus Runners", link: "/guides/ci/cirrus-runners" },
						{ text: "GetMac", link: "/guides/ci/getmac" },
						{
							text: "GitHub-hosted macos-latest",
							link: "/guides/ci/gh-hosted",
						},
					],
				},
			],

			"/api/": [
				{
					text: "API Reference",
					items: [
						{ text: "@shoki/sdk", link: "/api/sdk" },
						{ text: "Matchers", link: "/api/matchers" },
						{ text: "@shoki/vitest", link: "/api/vitest" },
						{ text: "shoki (CLI)", link: "/api/cli" },
					],
				},
			],

			"/background/": [
				{
					text: "Background",
					items: [
						{ text: "Architecture", link: "/background/architecture" },
						{ text: "Platform risk", link: "/background/platform-risk" },
						{
							text: "Adding a screen reader driver",
							link: "/background/adding-a-driver",
						},
						{
							text: "Release setup (maintainers)",
							link: "/background/release-setup",
						},
					],
				},
			],
		},

		footer: {
			message: "Released under the MIT License.",
			copyright: "Copyright © 2026-present Shoki contributors",
		},
	},

	// Silent on in-page anchor warnings; loud on dead internal links.
	ignoreDeadLinks: [
		// These land in external repos — referenced before the real URL exists.
		/^https?:\/\/.*guidepup\.dev/,
	],
});
