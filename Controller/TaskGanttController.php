<?php

namespace Kanboard\Plugin\DhtmlGantt\Controller;

use Kanboard\Controller\BaseController;
use Kanboard\Filter\TaskProjectFilter;
use Kanboard\Model\TaskModel;

/**
 * Tasks Gantt Controller
 *
 * KB_Backend_Controller
 *   - Handles all HTTP endpoints for the task-level Gantt: initial
 *     page render, JSON data feed (`getData`), saves, creates, and
 *     dependency add/remove actions.
 *
 * KB_Sprints_Logic
 *   - Persists sprint metadata, sprint child relationships, and sprint
 *     progress back into Kanboard.
 *
 * KB_Task_Types
 *   - Ensures task_type and is_milestone metadata are saved alongside
 *     the main task record.
 *
 * KB_Task_Dependencies
 *   - Server-side parts of dependency management (link add/remove).
 *
 * See KB_COMMENT_TABLE.md for a full description of the KB_* tags used
 * across this plugin.
 *
 * @package  Kanboard\Plugin\DhtmlGantt\Controller
 * @author   Your Development Team
 * @property \Kanboard\Plugin\DhtmlGantt\Formatter\TaskGanttFormatter $taskGanttFormatter
 */
class TaskGanttController extends BaseController
{
    // ===== KB_Backend_Controller: Main Gantt view endpoint =====
    /**
     * Show Gantt chart for one project
     */
    public function show()
    {
        $project = $this->getProject();

        if (isset($_GET['search'])) {
            $search = $this->helper->projectHeader->getSearchQuery($project);
            $search = $this->enhanceSearchQuery($search);
        } else {
            $search = 'status:open status:closed';
        }

        $sorting = $this->request->getStringParam('sorting', '');

        // NEW: read dropdown selection (none|group|assignee|sprint)
        $groupBy = $this->request->getStringParam('group_by', 'none');

        // tell the formatter what to do
        if (method_exists($this->taskGanttFormatter, 'setGroupBy')) {
            $this->taskGanttFormatter->setGroupBy($groupBy);
        }        

        $filter = $this->taskLexer->build($search)->withFilter(new TaskProjectFilter($project['id']));

        if ($sorting === '') {
            $sorting = $this->configModel->get('dhtmlgantt_task_sort', 'board');
        }

        if ($sorting === 'date') {
            $filter->getQuery()->asc(TaskModel::TABLE.'.date_started')->asc(TaskModel::TABLE.'.date_due');
        } else {
            $filter->getQuery()->asc('column_position')->asc(TaskModel::TABLE.'.position');
        }

        // NEW: move-dependencies preference (unchanged)
        $moveDepsEnabled = $this->projectMetadataModel->get($project['id'], 'move_dependencies_enabled', true);

        // (Optional) if your formatter needs the project context:
        if (method_exists($this->taskGanttFormatter, 'setProject')) {
            $this->taskGanttFormatter->setProject($project);
        }

        // ✅ Get only groups used in this project (not all groups in the system)
        $groups = $this->getProjectGroups($project['id']);

        $this->response->html($this->helper->layout->app(
            'DhtmlGantt:task_gantt/show',
            array(
                'project'          => $project,
                'title'            => $project['name'],
                'description'      => $this->helper->projectHeader->getDescription($project),
                'sorting'          => $sorting,
                'tasks'            => $filter->format($this->taskGanttFormatter),
                'moveDepsEnabled'  => $moveDepsEnabled,
                'groupBy'          => $groupBy, // NEW (optional—your template can also read from request)
                'groups'           => $groups,  // All groups for legend
            )
        ));
    }

    // ===== KB_Backend_Controller: JSON endpoint for fast AJAX refresh =====
    /**
     * Get task data as JSON (for fast AJAX refresh without page reload)
     */
    public function getData()
    {
        $project = $this->getProject();

        if (isset($_GET['search'])) {
            $search = $this->helper->projectHeader->getSearchQuery($project);
            $search = $this->enhanceSearchQuery($search);
        } else {
            $search = 'status:open status:closed';
        }

        $sorting = $this->request->getStringParam('sorting', '');
        $groupBy = $this->request->getStringParam('group_by', 'none');

        if (method_exists($this->taskGanttFormatter, 'setGroupBy')) {
            $this->taskGanttFormatter->setGroupBy($groupBy);
        }

        $filter = $this->taskLexer->build($search)->withFilter(new TaskProjectFilter($project['id']));

        if ($sorting === '') {
            $sorting = $this->configModel->get('dhtmlgantt_task_sort', 'board');
        }

        if ($sorting === 'date') {
            $filter->getQuery()->asc(TaskModel::TABLE.'.date_started')->asc(TaskModel::TABLE.'.date_due');
        } else {
            $filter->getQuery()->asc('column_position')->asc(TaskModel::TABLE.'.position');
        }

        if (method_exists($this->taskGanttFormatter, 'setProject')) {
            $this->taskGanttFormatter->setProject($project);
        }

        // Return JSON data directly
        $this->response->json($filter->format($this->taskGanttFormatter));
    }


    // ===== KB_Backend_Controller / KB_Task_Types: Save task updates =====
    /**
     * Save task updates (title, dates, priority, etc.)
     */
    public function save()
    {
        $this->getProject();
        $changes = $this->request->getJson();
        $values = [];
        
        // Debug logging

        $task_id = (int) $changes['id'];
        $values['id'] = $task_id;

        // Load current metadata to determine stored task type, etc.
        $metadata = $this->taskMetadataModel->getAll($task_id);
        //$currentTaskType = isset($metadata['task_type']) && $metadata['task_type'] !== '' ? $metadata['task_type'] : 'task';
        $currentTaskType = $metadata['task_type'] ?? 'task';
        // If this task is a sprint, always treat it as sprint even if frontend doesn't resend task_type
        if ($currentTaskType === 'sprint') {
            $hasChildTasksPayload = true;
        }


        // Update title/description
        if (! empty($changes['text'])) {
            $values['title'] = $changes['text'];
        }

        // Update start date
        if (! empty($changes['start_date'])) {
            $startTime = strtotime($changes['start_date']);
            if ($startTime !== false) {
                $values['date_started'] = $startTime;
            }
        }

        // Update end/due date
        if (! empty($changes['end_date'])) {
            $endTime = strtotime($changes['end_date']);
            if ($endTime !== false) {
                $values['date_due'] = $endTime;
            }
        }

        // Update priority
        if (isset($changes['priority'])) {
            $priorityMap = array(
                'low' => 1,
                'normal' => 0,
                'medium' => 2,
                'high' => 3
            );
            if (isset($priorityMap[$changes['priority']])) {
                $values['priority'] = $priorityMap[$changes['priority']];
            }
        }
        
        // Update assignee (owner_id)
        if (isset($changes['owner_id'])) {
            $values['owner_id'] = (int) $changes['owner_id'];
        }
        
        // Handle milestone status
        if (isset($changes['is_milestone'])) {
            $isMilestone = $changes['is_milestone'] ? '1' : '0';
            $this->taskMetadataModel->save($task_id, array('is_milestone' => $isMilestone));
        }
        
        // ✅ Handle task_type (task, milestone, sprint)
        if (isset($changes['task_type']) && $changes['task_type'] !== '') {
            $currentTaskType = $changes['task_type'];
            $this->taskMetadataModel->save($task_id, array('task_type' => $currentTaskType));
        }
        
        // ✅ FIX: Handle category_id updates
        if (isset($changes['category_id'])) {
            $values['category_id'] = (int) $changes['category_id'];
        }
        
        // ✅ FIX: Only handle sprint child_tasks if task is ALREADY a sprint
        // Don't auto-convert tasks to sprints just because child_tasks array is sent!
        $hasChildTasksPayload = isset($changes['child_tasks']) && is_array($changes['child_tasks']);
        
        if ($hasChildTasksPayload && $currentTaskType === 'sprint') {
            $newChildIds = is_array($changes['child_tasks']) ? $changes['child_tasks'] : array();
            $newChildIds = array_values(array_unique(array_map('intval', $newChildIds)));
            
            // Get existing child task IDs
            $existingChildIds = $this->getExistingChildIds($task_id);
            
            // Determine which links to add and remove
            $toAdd = array_diff($newChildIds, $existingChildIds);
            $toRemove = array_diff($existingChildIds, $newChildIds);
            
            
            // Get the link ID for "is a parent of"
            $linkId = $this->getLinkIdByLabel('is a parent of');
            
            if (!$linkId) {
            } else {
                // Remove old links
                foreach ($toRemove as $childId) {
                    $this->removeParentChildLink($task_id, (int)$childId);
                }
                
                // Add new links
                foreach ($toAdd as $childId) {
                    $this->taskLinkModel->create($task_id, (int)$childId, $linkId);
                }
            }
        }
        
        // ✅ Handle progress updates (store in metadata)
        if (isset($changes['progress'])) {
            $progress = (float) $changes['progress'];
            // Convert 0-1 range to 0-100 for storage
            $progressPercent = round($progress * 100);
            $this->taskMetadataModel->save($task_id, array('gantt_progress' => $progressPercent));
        }
        
        // ✅ Handle group and sprint updates from Gantt (if present)
        if (isset($changes['group_id'])) {
            $this->taskMetadataModel->save($task_id, array('group_id' => (int)$changes['group_id']));
        }
        if (isset($changes['sprint_id'])) {
            $newSprintId = (int) $changes['sprint_id'];
            $this->taskMetadataModel->save($task_id, array('sprint_id' => $newSprintId));
            if ($currentTaskType !== 'sprint') {
                $this->assignTaskToSprint($task_id, $newSprintId);
            }
        }

        
        // Always try to update if we have values (at minimum we have the ID)
        if (count($values) > 1) {
            
            $result = $this->taskModificationModel->update($values);
           
            // if ($result) {
            //     $this->adjustParentDuration($task_id);  // Automatically extend parent if needed
            // }

            if (! $result) {
                $this->response->json(array('result' => 'error', 'message' => 'Unable to save task'), 400);
            } else {
                $this->response->json(array('result' => 'ok', 'message' => 'Task updated successfully'), 200);
            }
        } else {
            $this->response->json(array('result' => 'ok', 'message' => 'No changes'), 200);
        }
    }

    // ===== KB_Backend_Controller / KB_Sprints_Logic: Create new task =====
    /**
     * Create new task
     */
    public function create()
    {
        $project = $this->getProject();
        $data = $this->request->getJson();
        
        // Debug logging

        // Map priority from string to integer
        $priority = 0; // default to normal
        if (isset($data['priority'])) {
            $priorityMap = array(
                'low' => 1,
                'normal' => 0,
                'medium' => 2,
                'high' => 3
            );
            if (isset($priorityMap[$data['priority']])) {
                $priority = $priorityMap[$data['priority']];
            }
        }

        $task_id = $this->taskCreationModel->create(array(
            'project_id' => $project['id'],
            'title' => $data['text'] ?? 'New Task',
            'date_started' => !empty($data['start_date']) ? strtotime($data['start_date']) : null,
            'date_due' => !empty($data['end_date']) ? strtotime($data['end_date']) : null,
            'priority' => $priority,
            'owner_id' => isset($data['owner_id']) ? (int) $data['owner_id'] : 0,
            'category_id' => isset($data['category_id']) ? (int) $data['category_id'] : 0,  // ✅ FIX: Include category_id
            'creator_id' => $this->userSession->getId(),
        ));

        if ($task_id) {
            // Save milestone status if provided
            if (isset($data['is_milestone'])) {
                $isMilestone = $data['is_milestone'] ? '1' : '0';
                $this->taskMetadataModel->save($task_id, array('is_milestone' => $isMilestone));
            }

            // Handle task_type metadata (task, milestone, sprint)
            $createdTaskType = isset($data['task_type']) && $data['task_type'] !== '' ? $data['task_type'] : 'task';
            $this->taskMetadataModel->save($task_id, array('task_type' => $createdTaskType));

            if (isset($data['sprint_id'])) {
                $newSprintId = (int) $data['sprint_id'];
                $this->taskMetadataModel->save($task_id, array('sprint_id' => $newSprintId));
                if ($createdTaskType !== 'sprint') {
                    $this->assignTaskToSprint($task_id, $newSprintId);
                }
            }

            // If sprint, create parent-child links immediately
            if ($createdTaskType === 'sprint' && !empty($data['child_tasks']) && is_array($data['child_tasks'])) {
                $linkId = $this->getLinkIdByLabel('is a parent of');
                if ($linkId) {
                    $childIds = array_values(array_unique(array_map('intval', $data['child_tasks'])));
                    foreach ($childIds as $childId) {
                        if ($childId > 0) {
                            $this->taskLinkModel->create($task_id, $childId, $linkId);
                        }
                    }
                } else {
                }
            }
            
            $this->response->json(array(
                'result' => 'ok',
                'id' => $task_id,
                'message' => 'Task created successfully'
            ), 201);
        } else {
            $this->response->json(array(
                'result' => 'error',
                'message' => 'Unable to create task'
            ), 400);
        }
    }

    /**
     * Delete task
     */
    public function remove()
    {
        $project = $this->getProject();
        $data = $this->request->getJson();
        $task_id = (int) ($data['id'] ?? 0);
        
        // Debug logging

        if ($task_id && $this->taskModel->remove($task_id)) {
            $this->response->json(array(
                'result' => 'ok',
                'message' => 'Task deleted successfully'
            ), 200);
        } else {
            $this->response->json(array(
                'result' => 'error',
                'message' => 'Unable to delete task'
            ), 400);
        }
    }

    /**
     * Save task dependency (link connection)
     */
    public function dependency()
    {
        // Debug logging
        
        try {
            $project = $this->getProject();
            
            $data = $this->request->getJson();
            
            if (empty($data['source']) || empty($data['target'])) {
                $this->response->json(array('result' => 'error', 'message' => 'Missing task IDs'), 400);
                return;
            }
        } catch (Exception $e) {
            $this->response->json(array('result' => 'error', 'message' => 'Server error: ' . $e->getMessage()), 500);
            return;
        }

        try {
            $sourceTaskId = (int) $data['source'];
            $targetTaskId = (int) $data['target'];

            // Validate that both tasks exist and belong to the current project
            $sourceTask = $this->taskFinderModel->getById($sourceTaskId);
            $targetTask = $this->taskFinderModel->getById($targetTaskId);

            if (!$sourceTask || !$targetTask) {
                $this->response->json(array('result' => 'error', 'message' => 'One or both tasks not found'), 404);
                return;
            }

            if ($sourceTask['project_id'] != $project['id'] || $targetTask['project_id'] != $project['id']) {
                $this->response->json(array('result' => 'error', 'message' => 'Tasks must belong to the same project'), 403);
                return;
            }

            // ✅ Determine link type based on 'type' parameter (moved up before circular check)
            // type = 'child' means creating parent-child relationship (subtask)
            // type = '1' or default means creating dependency (blocks)
            $linkType = isset($data['type']) ? $data['type'] : 'blocks';
            $linkLabel = 'blocks'; // default
            
            if ($linkType === 'child' || $linkType === '1') {
                // Creating parent-child relationship: source is child of target
                $linkLabel = 'is a child of';
            } else {
                // Creating dependency: source blocks target
                $linkLabel = 'blocks';
            }
            
            $linkId = $this->getLinkIdByLabel($linkLabel);
            
            if (!$linkId) {
                $this->response->json(array('result' => 'error', 'message' => 'Link type "' . $linkLabel . '" not found'), 500);
                return;
            }
            
            // ✅ Check for circular dependencies ONLY for "blocks" relationships, NOT parent-child
            if ($linkLabel === 'blocks' && $this->wouldCreateCircularDependency($sourceTaskId, $targetTaskId)) {
                $this->response->json(array('result' => 'error', 'message' => 'Circular dependency detected'), 400);
                return;
            }

            // Create link: TaskLinkModel::create() expects 3 separate arguments: (taskId, oppositeTaskId, linkId)
            $result = $this->taskLinkModel->create($sourceTaskId, $targetTaskId, $linkId);

            if ($result) {
                $this->response->json(array('result' => 'ok', 'message' => 'Dependency created successfully'), 201);
            } else {
                $this->response->json(array('result' => 'error', 'message' => 'Unable to create dependency'), 500);
            }
        } catch (Exception $e) {
            $this->response->json(array('result' => 'error', 'message' => 'Server error: ' . $e->getMessage()), 500);
        }
    }

    // ===== KB_Task_Dependencies: Remove task dependency =====
    /**
     * Remove task dependency
     */
    public function removeDependency()
    {
        // Debug logging
        
        try {
            $project = $this->getProject();
            $data = $this->request->getJson();
            
            if (empty($data['id'])) {
                $this->response->json(array('result' => 'error', 'message' => 'Missing link ID'), 400);
                return;
            }

            $linkId = (int) $data['id'];
            
            $result = $this->taskLinkModel->remove($linkId);
            
            if ($result) {
                $this->response->json(array('result' => 'ok', 'message' => 'Dependency removed successfully'), 200);
            } else {
                $this->response->json(array('result' => 'error', 'message' => 'Unable to remove dependency'), 500);
            }
        } catch (Exception $e) {
            $this->response->json(array('result' => 'error', 'message' => 'Server error: ' . $e->getMessage()), 500);
        }
    }

    /**
     * Automatically adjust parent duration when a child is extended.
     * ✅ ONLY adjusts SPRINTS, not regular parent-child tasks
     */
    // private function adjustParentDuration(int $childId): void
    // {
    //     $parentId = $this->getParentIdFromLinks($childId);
    //     if (!$parentId) {
    //         return;
    //     }

    //     $parent = $this->taskModel->getById($parentId);
    //     $child  = $this->taskModel->getById($childId);

    //     if (!$parent || !$child) {
    //         return;
    //     }
        
    //     // ✅ ONLY adjust duration for SPRINTS, not regular parent tasks
    //     $parentMetadata = $this->taskMetadataModel->getAll($parentId);
    //     $isSprint = isset($parentMetadata['task_type']) && $parentMetadata['task_type'] === 'sprint';
        
    //     if (!$isSprint) {
    //         return;
    //     }

    //     $parentStart = $parent['date_started'] ?: $parent['date_creation'];
    //     $parentEnd   = $parent['date_due']     ?: $parent['date_creation'];
    //     $childStart  = $child['date_started']  ?: $child['date_creation'];
    //     $childEnd    = $child['date_due']      ?: $child['date_creation'];

    //     $update = ['id' => $parentId];
    //     $needsUpdate = false;

    //     // Extend parent earlier if child starts earlier
    //     if ($childStart && $childStart < $parentStart) {
    //         $update['date_started'] = $childStart;
    //         $needsUpdate = true;
    //     }

    //     if ($childEnd && $childEnd > $parentEnd) {
    //         $update['date_due'] = $childEnd;
    //         $needsUpdate = true;
    //     } else {
    //         // shrink parent if all children end earlier
    //         $latestChildEnd = 0;
    //         $children = $this->taskLinkModel->getAll($parentId);
    //         foreach ($children as $link) {
    //             if (mb_strtolower($link['label']) === 'is parent of') {
    //                 $child = $this->taskModel->getById($link['opposite_task_id']);
    //                 if ($child && $child['date_due'] > $latestChildEnd) {
    //                     $latestChildEnd = $child['date_due'];
    //                 }
    //             }
    //         }
    //         if ($latestChildEnd && $latestChildEnd < $parentEnd) {
    //             $update['date_due'] = $latestChildEnd;
    //             $needsUpdate = true;
    //         }
    //     }        

    //     if ($needsUpdate) {
    //         $this->taskModificationModel->update($update);
    //     }
    // }

    /**
     * Resolve parent ID using Kanboard’s internal links (“is child of”).
     */
    // private function getParentIdFromLinks(int $taskId): ?int
    // {
    //     $links = $this->taskLinkModel->getAll($taskId);
    //     foreach ($links as $link) {
    //         if (mb_strtolower($link['label']) === 'is child of') {
    //             return (int)$link['opposite_task_id'];
    //         }
    //     }
    //     return null;
    // }


    /**
     * Check if creating a dependency would create a circular reference
     */
    private function wouldCreateCircularDependency($sourceTaskId, $targetTaskId)
    {
        // Get all tasks that depend on the target task
        $dependentTasks = $this->getAllDependentTasks($targetTaskId);
        
        // If the source task is in the dependent tasks list, it would create a cycle
        return in_array($sourceTaskId, $dependentTasks);
    }

    /**
     * Get all tasks that depend on a given task (recursive)
     * ✅ ONLY checks "blocks" relationships, NOT parent-child relationships
     */
    private function getAllDependentTasks($taskId, $visited = array())
    {
        if (in_array($taskId, $visited)) {
            return array(); // Prevent infinite recursion
        }

        $visited[] = $taskId;
        $dependentTasks = array();

        // Get all tasks that have this task as a dependency
        $links = $this->taskLinkModel->getAll($taskId);
        
        foreach ($links as $link) {
            // ✅ ONLY check "blocks" relationships, skip parent-child relationships
            $linkLabel = strtolower($link['label'] ?? '');
            if ($linkLabel !== 'blocks' && $linkLabel !== 'is blocked by') {
                continue; // Skip non-dependency links (e.g., parent-child)
            }
            
            $dependentTaskId = $link['task_id'];
            $dependentTasks[] = $dependentTaskId;
            
            // Recursively get tasks that depend on this dependent task
            $subDependents = $this->getAllDependentTasks($dependentTaskId, $visited);
            $dependentTasks = array_merge($dependentTasks, $subDependents);
        }

        return array_unique($dependentTasks);
    }

    /**
     * Get link ID by label (e.g., 'blocks', 'is blocked by')
     */
    private function getLinkIdByLabel($label)
    {
        $link = $this->db->table('links')->eq('label', $label)->findOne();
        return $link ? $link['id'] : null;
    }
    
    /**
     * Get existing child task IDs for a parent task (sprint)
     * Reads from task_has_links table using "is a parent of" / "is a child of" labels
     */
    private function getExistingChildIds($parentId)
    {
        $childIds = array();
        
        // Case 1: Links where parent is task_id with label "is a parent of"
        $rows = $this->db->table('task_has_links')
            ->join('links', 'id', 'link_id')
            ->columns('links.label', 'task_has_links.opposite_task_id')
            ->eq('task_has_links.task_id', $parentId)
            ->findAll();
        
        foreach ($rows as $row) {
            $label = $row['label'] ?? ($row['links.label'] ?? '');
            if ($label === 'is a parent of') {
                $childId = (int) ($row['opposite_task_id'] ?? ($row['task_has_links.opposite_task_id'] ?? 0));
                if ($childId > 0) {
                    $childIds[] = $childId;
                }
            }
        }
        
        // Case 2: Links where parent is opposite_task_id with label "is a child of"
        $rows = $this->db->table('task_has_links')
            ->join('links', 'id', 'link_id')
            ->columns('links.label', 'task_has_links.task_id')
            ->eq('task_has_links.opposite_task_id', $parentId)
            ->findAll();
        
        foreach ($rows as $row) {
            $label = $row['label'] ?? ($row['links.label'] ?? '');
            if ($label === 'is a child of') {
                $childId = (int) ($row['task_id'] ?? ($row['task_has_links.task_id'] ?? 0));
                if ($childId > 0) {
                    $childIds[] = $childId;
                }
            }
        }
        
        return array_unique($childIds);
    }
    
    /**
     * Remove parent-child link between parent and child task
     */
    private function removeParentChildLink($parentId, $childId)
    {
        // Find and remove the link in task_has_links table
        // Could be stored as (parent, child, "is a parent of") OR (child, parent, "is a child of")
        
        $linkId = $this->getLinkIdByLabel('is a parent of');
        if ($linkId) {
            $this->db->table('task_has_links')
                ->eq('task_id', $parentId)
                ->eq('opposite_task_id', $childId)
                ->eq('link_id', $linkId)
                ->remove();
        }
        
        $linkId = $this->getLinkIdByLabel('is a child of');
        if ($linkId) {
            $this->db->table('task_has_links')
                ->eq('task_id', $childId)
                ->eq('opposite_task_id', $parentId)
                ->eq('link_id', $linkId)
                ->remove();
        }
        
    }

    private function assignTaskToSprint(int $taskId, int $newSprintId): void
    {
        $currentSprintId = $this->getSprintParentId($taskId);

        if ($currentSprintId && $currentSprintId !== $newSprintId) {
            $this->removeParentChildLink($currentSprintId, $taskId);
        }

        if ($newSprintId <= 0) {
            return;
        }

        if (!$this->isSprintTask($newSprintId)) {
            return;
        }

        if ($currentSprintId === $newSprintId) {
            return;
        }

        $linkId = $this->getLinkIdByLabel('is a parent of');
        if ($linkId) {
            $this->taskLinkModel->create($newSprintId, $taskId, $linkId);
        }
    }

    private function getSprintParentId(int $childId): ?int
    {
        $rows = $this->db->table('task_has_links')
            ->join('links', 'id', 'link_id')
            ->columns('links.label', 'task_has_links.task_id', 'task_has_links.opposite_task_id')
            ->eq('task_has_links.task_id', $childId)
            ->findAll();

        foreach ($rows as $row) {
            $label = $row['label'] ?? ($row['links.label'] ?? '');
            if ($label === 'is a child of') {
                $parentId = (int) ($row['opposite_task_id'] ?? ($row['task_has_links.opposite_task_id'] ?? 0));
                if ($parentId > 0 && $this->isSprintTask($parentId)) {
                    return $parentId;
                }
            }
        }

        $rows = $this->db->table('task_has_links')
            ->join('links', 'id', 'link_id')
            ->columns('links.label', 'task_has_links.task_id', 'task_has_links.opposite_task_id')
            ->eq('task_has_links.opposite_task_id', $childId)
            ->findAll();

        foreach ($rows as $row) {
            $label = $row['label'] ?? ($row['links.label'] ?? '');
            if ($label === 'is a parent of') {
                $parentId = (int) ($row['task_id'] ?? ($row['task_has_links.task_id'] ?? 0));
                if ($parentId > 0 && $this->isSprintTask($parentId)) {
                    return $parentId;
                }
            }
        }

        return null;
    }

    private function isSprintTask(int $taskId): bool
    {
        if ($taskId <= 0) {
            return false;
        }
        $metadata = $this->taskMetadataModel->getAll($taskId);
        return isset($metadata['task_type']) && $metadata['task_type'] === 'sprint';
    }
    
    // ===== KB_Task_Dependencies: Add task dependency =====
    // POST /dhtmlxgantt/:project_id/dependency
    public function addDependency()
    {
        $project = $this->getProject();
        $payload = json_decode($this->request->getBody(), true) ?: [];

        $source = (int) ($payload['source'] ?? 0);
        $target = (int) ($payload['target'] ?? 0);

        // 1) Basic checks
        if (!$source || !$target || $source === $target) {
            return $this->response->json(['result' => 'error','message' => 'Invalid source/target'], 400);
        }

        // 2) SAME-LEVEL RULE
        $s = $this->taskModel->getById($source);
        $t = $this->taskModel->getById($target);
        $sParent = (int) ($s['owner_id'] ? 0 : 0); // placeholder; we use internal links to compute parent (see note below)

        // If you already expose parent in your formatter, just read it back from DB:
        $sParent = (int) ($s['parent_id'] ?? 0);
        $tParent = (int) ($t['parent_id'] ?? 0);

        $sameLevel = (($sParent === 0 && $tParent === 0) || ($sParent !== 0 && $sParent === $tParent));
        if (!$sameLevel) {
            return $this->response->json(['result' => 'error','message' => 'Rule: only siblings or top-level tasks can be linked'], 400);
        }

        // 3) CIRCULAR check (cheap)
        if ($this->taskLinkModel->hasLink($target, $source)) {
            return $this->response->json(['result' => 'error','message' => 'Circular dependency detected'], 400);
        }

        // 4) Create internal link: “blocks” from source → target
        $ok = $this->taskLinkModel->create($source, $target, $this->linkModel->getIdByLabel('blocks'));
        if (!$ok) {
            return $this->response->json(['result' => 'error','message' => 'Could not create dependency'], 500);
        }

        return $this->response->json(['result' => 'ok']);
    }

    /**
     * Save or update "Move Dependencies with Task" setting (per project)
     */
    public function saveMoveDependenciesSetting()
    {
        $project = $this->getProject();
        $enabled = $this->request->getStringParam('enabled') === 'true';

        // Save per-project setting in metadata
        $this->projectMetadataModel->save($project['id'], [
            'move_dependencies_enabled' => $enabled ? '1' : '0',
        ]);

        $this->response->json([
            'result' => 'ok',
            'project_id' => $project['id'],
            'enabled' => $enabled,
        ]);
    }

    /**
     * ✅ SMART SEARCH ENHANCEMENT V2
     * Automatically detects username OR user group searches
     * Adds appropriate prefix: "assignee:" for users, "group:" for user groups
     * Makes search more intuitive for stakeholders unfamiliar with Kanboard syntax
     * 
     * @param string $search Original search query
     * @return string Enhanced search query
     */
    private function enhanceSearchQuery($search)
    {
        // Trim whitespace
        $search = trim($search);
        
        // If empty, return as-is
        if (empty($search)) {
            return $search;
        }
        
        // List of Kanboard search keywords/filters
        $kanboardKeywords = [
            'assignee:', 'creator:', 'category:', 'color:', 'column:', 
            'description:', 'due:', 'modified:', 'created:', 'status:', 
            'title:', 'reference:', 'link:', 'swimlane:', 'tag:', 
            'priority:', 'project:', 'subtask:', 'group:'
        ];
        
        // Check if search already contains a Kanboard keyword
        foreach ($kanboardKeywords as $keyword) {
            if (stripos($search, $keyword) !== false) {
                // Already has a filter keyword, return as-is
                return $search;
            }
        }
        
        // Check if it's a simple word/phrase (likely a username or group name)
        // If it contains only alphanumeric, spaces, dots, underscores, hyphens
        if (preg_match('/^[\w\s\.\-]+$/i', $search)) {
            $project = $this->getProject();
            $searchLower = strtolower($search);
            
            // PRIORITY 1: Check user groups first (organizational unit)
            $groups = $this->groupModel->getAll();
            foreach ($groups as $group) {
                $groupName = strtolower($group['name']);
                
                // If search matches group name (exact or partial)
                if ($groupName === $searchLower || 
                    strpos($groupName, $searchLower) !== false) {
                    
                    // Get all users in this group
                    $groupMembers = $this->groupMemberModel->getMembers($group['id']);
                    
                    if (!empty($groupMembers)) {
                        // Build OR query: assignee:user1 assignee:user2 assignee:user3
                        $userQueries = [];
                        foreach ($groupMembers as $member) {
                            $userQueries[] = 'assignee:' . $member['username'];
                        }
                        
                        // Join with OR logic (space-separated in Kanboard means OR for same field)
                        return implode(' ', $userQueries);
                    } else {
                        // Group exists but has no members, return impossible query
                        return 'assignee:__NOBODY__';
                    }
                }
            }
            
            // PRIORITY 2: Check users/assignees in this project
            $users = $this->projectUserRoleModel->getUsers($project['id']);
            foreach ($users as $user) {
                $username = strtolower($user['username']);
                $name = strtolower($user['name'] ?? '');
                
                // If search matches username or name (exact or partial)
                if ($username === $searchLower || $name === $searchLower || 
                    strpos($username, $searchLower) !== false || 
                    strpos($name, $searchLower) !== false) {
                    return 'assignee:' . $search;
                }
            }
            
            // PRIORITY 3: If not found in either, default to assignee search
            // (More common use case than group)
            return 'assignee:' . $search;
        }
        
        // For complex queries with special characters, return as-is
        return $search;
    }

    /**
     * Get project users and groups for assignment dropdowns
     */
    public function getProjectMembers()
    {
        try {
            $project = $this->getProject();
            
            // Get users assigned to this project
            $projectUsers = $this->projectUserRoleModel->getUsers($project['id']);
            
            $formattedUsers = array();
            
            // Add "Unassigned" option
            $formattedUsers[] = array(
                'key' => 0,
                'label' => 'Unassigned'
            );
            
            // Format users
            foreach ($projectUsers as $user) {
                $userId = isset($user['id']) ? $user['id'] : 0;
                $userName = isset($user['username']) ? $user['username'] : 
                           (isset($user['name']) && $user['name'] ? $user['name'] : 'User #' . $userId);
                
                if ($userId > 0) {
                    $formattedUsers[] = array(
                        'key' => (int)$userId,
                        'label' => $userName
                    );
                }
            }
            
            // ✅ Get project CATEGORIES (not user groups!)
            $categories = $this->getProjectGroups($project['id']);  // This already returns categories
            $formattedGroups = array();
            
            // Add "No Category" option
            $formattedGroups[] = array(
                'key' => 0,
                'label' => 'No Category',
                'color' => '#bdc3c7',
            );
            
            // Format categories for frontend dropdown
            foreach ($categories as $category) {
                $formattedGroups[] = array(
                    'key' => (int)$category['id'],
                    'label' => $category['name'],
                    'color' => isset($category['color']) && $category['color'] !== '' ? $category['color'] : '#bdc3c7',
                );
            }
            
            
            
            $this->response->json(array(
                'result' => 'ok',
                'users' => $formattedUsers,
                'groups' => $formattedGroups
            ));
        } catch (\Exception $e) {
            $this->response->json(array(
                'result' => 'error',
                'message' => $e->getMessage()
            ), 500);
        }
    }

    /**
     * Get only the CATEGORIES that are actually used by tasks in this project
     * 
     * @access private
     * @param  int $project_id
     * @return array Array of unique categories used in the project with their colors
     */
    private function getProjectGroups($project_id)
    {
        // Get all tasks in this project
        $tasks = $this->taskFinderModel->getAll($project_id);
        
        if (empty($tasks)) {
            return array();
        }
        
        $categoryIds = array();
        
        // ✅ Collect unique CATEGORIES from tasks (not user groups)
        foreach ($tasks as $task) {
            if (!empty($task['category_id'])) {
                $category = $this->categoryModel->getById($task['category_id']);
                if ($category) {
                    // ✅ FIX: Get the actual Kanboard color for this category with better error handling
                    $category['color'] = '#bdc3c7'; // Default gray fallback
                    
                    if (!empty($category['color_id'])) {
                        $colorProps = $this->colorModel->getColorProperties($category['color_id']);
                        if ($colorProps && isset($colorProps['background']) && !empty($colorProps['background'])) {
                            $category['color'] = $colorProps['background'];
                        }
                    }
                    
                    // ✅ Ensure color is always set (never empty/null)
                    if (empty($category['color'])) {
                        $category['color'] = '#bdc3c7';
                    }
                    
                    // Use category ID as key to avoid duplicates
                    $categoryIds[$category['id']] = $category;
                }
            }
        }
        
        // Return unique categories
        return array_values($categoryIds);
    }

}
