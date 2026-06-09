import type { APIRoute } from 'astro';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

// POST - Create new task
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

    // Read project file
    const projectFile = join(process.cwd(), 'data', 'admin', 'projects', `${projectId}.json`);
    const content = await readFile(projectFile, 'utf-8');
    const project = JSON.parse(content);

    // Create new task
    const today = new Date().toISOString().split('T')[0];
    const newTask = {
      id: Date.now().toString(),
      title,
      description,
      completed: false,
      createdAt: today,
      completedAt: null
    };

    // Add to tasks array
    project.tasks = project.tasks || [];
    project.tasks.push(newTask);
    project.updatedAt = today;

    // Write back to file
    await writeFile(projectFile, JSON.stringify(project, null, 2), 'utf-8');

    return new Response(JSON.stringify({ success: true, task: newTask }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error creating task:', error);
    return new Response(JSON.stringify({ error: 'Failed to create task' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// PATCH - Update task (toggle completion)
export const PATCH: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { projectId, taskId, completed } = body;

    if (!projectId || !taskId || completed === undefined) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Read project file
    const projectFile = join(process.cwd(), 'data', 'admin', 'projects', `${projectId}.json`);
    const content = await readFile(projectFile, 'utf-8');
    const project = JSON.parse(content);

    // Find and update task
    const task = project.tasks?.find((t: any) => t.id === taskId);
    if (!task) {
      return new Response(JSON.stringify({ error: 'Task not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const today = new Date().toISOString().split('T')[0];
    task.completed = completed;
    task.completedAt = completed ? today : null;
    project.updatedAt = today;

    // Write back to file
    await writeFile(projectFile, JSON.stringify(project, null, 2), 'utf-8');

    return new Response(JSON.stringify({ success: true, task }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error updating task:', error);
    return new Response(JSON.stringify({ error: 'Failed to update task' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
