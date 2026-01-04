import { PageLayout, SharedLayout } from "./quartz/cfg"
import * as Component from "./quartz/components"

// components shared across all pages
export const sharedPageComponents: SharedLayout = {
  head: Component.Head(),
  header: [],
  afterBody: [
    Component.Comments({
      provider: 'giscus',
      options: {
        // from data-repo
        repo: 'lincolnbryant/blog',
        // from data-repo-id
        repoId: 'R_kgDOQu2jow',
        // from data-category
        category: 'Announcements',
        // from data-category-id
        categoryId: 'DIC_kwDOQu2jo84C0gzk',
        // from data-lang
        lang: 'en'
      }
    }),
  ],
  footer: Component.Footer({
    links: {
      GitHub: "https://github.com/lincolnbryant",
    },
  }),
}

// components for pages that display a single page (e.g. a single note)
export const defaultContentPageLayout: PageLayout = {
  beforeBody: [
    Component.ConditionalRender({
      component: Component.Breadcrumbs(),
      condition: (page) => page.fileData.slug !== "index",
    }),
    Component.ArticleTitle(),
    Component.ContentMeta(),
    Component.TagList(),
  ],
  left: [
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        {
          Component: Component.Search(),
          grow: true,
        },
        { Component: Component.Darkmode() },
        { Component: Component.ReaderMode() },
      ],
    }),
    Component.Explorer({
      sortFn: (a, b) => {
        // If both are folders, sort alphabetically
        if (!a.file && !b.file) {
          return a.displayName.localeCompare(b.displayName, undefined, {
            numeric: true,
            sensitivity: "base",
          })
        }
        
        // Folders come before files
        if (!a.file) return -1
        if (!b.file) return 1
        
        // Get dates - check frontmatter first, then fall back to file dates
        const aDate = a.file?.frontmatter?.date 
          ? new Date(a.file.frontmatter.date).getTime()
          : new Date(a.file?.dates?.created ?? 0).getTime()
        
        const bDate = b.file?.frontmatter?.date
          ? new Date(b.file.frontmatter.date).getTime() 
          : new Date(b.file?.dates?.created ?? 0).getTime()
        
        // Sort descending (newest first)
        return bDate - aDate
      }
    })
  ],
  right: [
    Component.Graph(),
    Component.DesktopOnly(Component.TableOfContents()),
    Component.Backlinks(),
  ],
}

// components for pages that display lists of pages  (e.g. tags or folders)
export const defaultListPageLayout: PageLayout = {
  beforeBody: [Component.Breadcrumbs(), Component.ArticleTitle(), Component.ContentMeta()],
  left: [
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        {
          Component: Component.Search(),
          grow: true,
        },
        { Component: Component.Darkmode() },
      ],
    }),
    Component.Explorer({
	sortFn: (a, b) => {
		if (a.data?.frontmatter?.date && b.data?.frontmatter?.date) {
		  const dateA = new Date(a.data.frontmatter.date);
		  const dateB = new Date(b.data.frontmatter.date);
		  
		  // Use (dateB - dateA) for newest first, or (dateA - dateB) for oldest first
		  return dateB.getTime() - dateA.getTime();
		}
		const d1 = new Date(a.dates?.created ?? 0).getTime()
		const d2 = new Date(b.dates?.created ?? 0).getTime()
		return d2 - d1
	}
    }),
  ],
  right: [],
}
