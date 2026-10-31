import type {ReactNode} from "react";
import {HeadContent, Outlet, Scripts, createRootRoute} from "@tanstack/react-router";
import {Toaster} from "@/components/ui/toaster";
import {Toaster as Sonner} from "@/components/ui/sonner";
import {TooltipProvider} from "@/components/ui/tooltip";
import {PLATFORM_META, PLATFORM_SCRIPTS} from "@/platform/scripts.gen";
import {HMR_CLIENT} from "@/platform/dev-hmr";
import appCss from "@/index.css?url";

const TITLE = "RusAPP — сообщения, аудио- и видеозвонки";
const DESCRIPTION =
    "Переписывайтесь и созванивайтесь с близкими по аудио и видео прямо в браузере — быстро, просто и без лишнего.";
const OG_IMAGE = "https://cdn.poehali.dev/projects/56349fef-92d7-4870-a37e-94d25b539997/files/94a0723f-3320-4cca-a7eb-fa331ca0ce19.jpg";

export const Route = createRootRoute({
    head: () => ({
        meta: [
            {charSet: "utf-8"},
            {name: "viewport", content: "width=device-width, initial-scale=1.0"},
            {title: TITLE},
            {name: "description", content: DESCRIPTION},
            {property: "og:title", content: TITLE},
            {property: "og:description", content: DESCRIPTION},
            {property: "og:image", content: OG_IMAGE},
            {property: "og:image:width", content: "1360"},
            {property: "og:image:height", content: "768"},
            {name: "twitter:image", content: OG_IMAGE},
            ...PLATFORM_META,
        ],
        links: [
            {rel: "preconnect", href: "https://fonts.googleapis.com"},
            {rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous"},
            {
                rel: "stylesheet",
                href: "https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500;600&family=Inter:wght@400;500&display=swap",
            },
            {rel: "stylesheet", href: appCss},
            {rel: "icon", type: "image/svg+xml", href: "/favicon.svg"},
        ],
        // IMPORTANT: DO NOT REMOVE PLATFORM SCRIPTS AND THE DEV HMR CLIENT!
        scripts: [
            ...(import.meta.env.DEV ? [{children: HMR_CLIENT}] : []),
            ...PLATFORM_SCRIPTS,
        ],
    }),
    component: RootComponent,
});

function RootComponent() {
    return (
        <RootDocument>
            <TooltipProvider>
                <Toaster/>
                <Sonner/>
                <Outlet/>
            </TooltipProvider>
        </RootDocument>
    );
}

function RootDocument({children}: { children: ReactNode }) {
    return (
        <html lang="ru">
        <head>
            <HeadContent/>
        </head>
        <body>
        {children}
        <Scripts/>
        </body>
        </html>
    );
}