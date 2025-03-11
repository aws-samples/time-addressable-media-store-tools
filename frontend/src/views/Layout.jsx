import { AWS_HLS_INGEST_ENDPOINT, AWS_MC_ENDPOINT, AWS_ML_ENDPOINT } from "@/constants";
import {
  AppLayout,
  BreadcrumbGroup,
  ContentLayout,
  Flashbar,
  SideNavigation,
} from "@cloudscape-design/components";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import Header from "@/components/Header";
import { useState } from "react";
import useStore from "@/stores/useStore";

const Layout = () => {
  const [navigationOpen, setNavigationOpen] = useState(true);
  const alertItems = useStore((state) => state.alertItems);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const followLink = (e) => {
    e.preventDefault();
    navigate(e.detail.href);
  };

  const breadCrumbs = () => {
    let breadCrumbPath = pathname;
    if (
      breadCrumbPath.startsWith("/player") ||
      breadCrumbPath.startsWith("/diagram")
    ) {
      const splitPath = pathname.split("/").filter((p) => p !== "");
      splitPath.push(splitPath.splice(0, 1)[0]);
      breadCrumbPath = "/" + splitPath.join("/");
    }
    const hrefs = breadCrumbPath
      .split("/")
      .slice(1)
      .reduce(
        (allPaths, subPath) => {
          const lastPath = allPaths[allPaths.length - 1];
          allPaths.push(
            lastPath.endsWith("/")
              ? lastPath + subPath
              : `${lastPath}/${subPath}`
          );
          return allPaths;
        },
        ["/"]
      );
    return hrefs.map((href) => ({
      text: href === "/" ? "home" : href.split("/").at(-1),
      href,
    }));
  };

  return (
    <>
      <Header />
      <AppLayout
        notifications={<Flashbar items={alertItems} stackItems />}
        breadcrumbs={
          <BreadcrumbGroup onFollow={followLink} items={breadCrumbs()} />
        }
        navigationOpen={navigationOpen}
        onNavigationChange={({ detail }) => setNavigationOpen(detail.open)}
        navigation={
          <SideNavigation
            onFollow={followLink}
            items={[
              {
                type: "section",
                text: "TAMS",
                items: [
                  { type: "link", text: "Sources", href: "/sources" },
                  { type: "link", text: "Flows", href: "/flows" },
                ],
              },
              AWS_HLS_INGEST_ENDPOINT || AWS_MC_ENDPOINT || AWS_ML_ENDPOINT
                ? {
                    type: "section",
                    text: "Ingestion",
                    items: [
                      AWS_HLS_INGEST_ENDPOINT
                        ? {
                            type: "link",
                            text: "HLS Ingestions",
                            href: "/workflows",
                          }
                        : {},
                      AWS_ML_ENDPOINT
                        ? {
                            type: "link",
                            text: "MediaLive Channels",
                            href: "/channels",
                          }
                        : {},
                      AWS_MC_ENDPOINT
                        ? {
                            type: "link",
                            text: "MediaConvert Jobs",
                            href: "/jobs",
                          }
                        : {},
                    ],
                  }
                : {},
            ]}
          />
        }
        toolsHide
        content={
          <ContentLayout disableOverlap>
            <Outlet />
          </ContentLayout>
        }
      />
    </>
  );
};

export default Layout;
