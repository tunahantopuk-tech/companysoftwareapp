import type { APIRoute } from 'astro';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { projectId, title, description } = body;

    if (!projectId || !title || !description) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const projectFile = join(process.cwd(), 'data', 'admin', 'projects', `${projectId}.json`);
    const content = await readFile(projectFile, 'utf-8');
    const project = JSON.parse(content);

    const today = new Date().toISOString().split('T')[0];
    const newTask = {
      id: Date.now().toString(),
      title,
      description,
      completed: false,
      createdAt: today,
      completedAt: null
    };

    project.tasks = project.tasks || [];
    project.tasks.push(newTask);
    project.updatedAt = today;

    await writeFile(projectFile, JSON.stringify(project, null, 2), 'utf-8');

    return new Response(JSON.stringify({ success: true, task: newTask }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
