import { serve } from "bun";

// Serve up the local test/ directory for faster development

serve({
    fetch(req) {
        const url = new URL(req.url);
        let path = `./test${url.pathname}`;

        // If the URL path is '/', serve 'index.html'
        if (url.pathname === '/') {
            path = './test/index.html';
        }

        try {
            const file = Bun.file(path);
            const contentType = getContentType(path);

            return new Response(file, {
                headers: {
                    "Content-Type": contentType,
                },
            });
        } catch (e) {
            return new Response("File not found", { status: 404 });
        }
    },
    port: 3000,
});

console.log("Server running at http://localhost:3000");

function getContentType(path: string): string {
    if (path.endsWith(".html")) return "text/html";
    if (path.endsWith(".css")) return "text/css";
    if (path.endsWith(".js")) return "application/javascript";
    if (path.endsWith(".svg")) return "image/svg+xml";
    return "text/plain";
}
