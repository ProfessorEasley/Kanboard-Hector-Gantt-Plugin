/*
 * DHtmlX Gantt Initialization Script for Kanboard
 *
 * TABLE OF CONTENTS (search for the KB_* tags below):
 *
 * KB_Init_Core
 *   - Base gantt config, columns, templates, lightbox layout, and
 *     overall initialization flow.
 *
 * KB_Lightbox_UI
 *   - Lightbox sections and UI wiring: type selector, sprint selector,
 *     task multi-select, and "View in Kanboard" button.
 *
 * KB_Sprints_Logic
 *   - Sprint creation, inline sprint flow, sprint child task management,
 *     and sprint duration recalculation.
 *
 * KB_Task_Types
 *   - Preserving and mapping task_type (task / milestone / sprint) on
 *     the frontend and when saving to Kanboard.
 *
 * KB_Task_Dependencies
 *   - Dependency rules, link creation/removal, move-with-dependencies
 *     behavior, and arrow head styling.
 *
 * KB_Zoom_And_Views
 *   - Zoom buttons, Day/Week/Month modes, smart fit-to-screen, and
 *     persistence of zoom/view settings across reloads.
 *
 * KB_Workload_Busyness
 *   - Workload panel, workload/busyness calculations, and the visual
 *     borders that show busyness on task bars.
 *
 * KB_Grouping_Assignee / KB_Grouping_Category / KB_Grouping_Sprint
 *   - Group-by utilities and data shaping for assignee, category, and
 *     sprint grouping modes.
 *
 * KB_DarkMode_Styling
 *   - Dark/bright mode toggle behavior and theme-specific styling
 *     (including arrow colors).
 *
 * KB_Interactive_Schedule
 *   - User experience upgrades: tooltips, context menu, keyboard
 *     shortcuts, and other interactive helpers.
 *
 * KB_CSP_And_Assets
 *   - Notes about how this script is loaded alongside the DHTMLX
 *     library and CSS override layers. See KB_COMMENT_TABLE.md for a
 *     full KB_* index used across the plugin.
 */

// ===== KB_Lightbox_UI: Global state used by lightbox helpers and sprint selector =====

// Store users and categories data globally (defined early)
window.projectUsers = [];
window.projectCategories = [];  // Categories from Kanboard (previously groups)
window.groupMemberMap = {};  // Keep for backward compatibility with cascading logic
window.projectSprints = [];  // Available sprint records for sprint selector
window.__sprintShortcutMode = false;
window.__inlineSprintFlow = null;

// Helper to get user label by ID from projectUsers
function getUserLabelById(userId) {
    var defaultLabel = 'Unassigned';
    var id = parseInt(userId, 10) || 0;
    if (id === 0) {
        return defaultLabel;
    }
    var users = window.projectUsers || [];
    for (var i = 0; i < users.length; i++) {
        var entry = users[i] || {};
        if (parseInt(entry.key, 10) === id) {
            return entry.label || defaultLabel;
        }
    }
    return defaultLabel;
}

// Helper function to get days in a month (handles leap years)
function getDaysInMonth(year, month) {
    // month is 0-indexed (0 = January, 11 = December)
    return new Date(year, month + 1, 0).getDate();
}

// Setup date validation for lightbox time selects
function setupDateValidation(retryCount) {
    retryCount = retryCount || 0;
    var lightbox = document.querySelector('.gantt_cal_light');
    if (!lightbox && retryCount < 10) {
        setTimeout(function() {
            setupDateValidation(retryCount + 1);
        }, 50);
        return;
    }
    if (!lightbox) {
        return;
    }

    // Find the time section - DHTMLX Gantt creates .gantt_time_selects containers
    var timeSelects = lightbox.querySelectorAll('.gantt_time_selects, .gantt_cal_larea .gantt_section_time');
    
    if (timeSelects.length === 0) {
        // Fallback: look for date selects directly
        var allSelects = lightbox.querySelectorAll('select');
        // Group selects by their container to handle start/end dates
        setupDateSelectValidation(lightbox);
        return;
    }
    
    timeSelects.forEach(function(container) {
        setupDateSelectValidation(container);
    });
}

function setupDateSelectValidation(container) {
    // Find all select elements in the container
    var selects = container.querySelectorAll('select');
    
    // DHTMLX Gantt time section typically has selects in order:
    // [day, month, year, hour, minute] for start, then same for end (if duration type)
    // Or it may use named/titled selects
    
    // Look for month selects (usually have 12 options for months)
    var dateGroups = [];
    var currentGroup = { day: null, month: null, year: null };
    var monthOptionCount = [12, 13]; // Some have 12, some have 13 (0-indexed)
    
    selects.forEach(function(select, index) {
        var optionCount = select.options.length;
        
        // Try to identify the select type by option count and values
        if (optionCount >= 28 && optionCount <= 31) {
            // Likely a day select (28-31 days)
            if (currentGroup.day) {
                // Start a new group
                dateGroups.push(currentGroup);
                currentGroup = { day: null, month: null, year: null };
            }
            currentGroup.day = select;
        } else if (optionCount === 12 || optionCount === 13) {
            // Likely a month select
            currentGroup.month = select;
        } else if (optionCount >= 2 && optionCount <= 20) {
            // Check if values look like years (4 digits starting with 19 or 20)
            var firstValue = select.options[0] ? select.options[0].value : '';
            if (/^(19|20)\d{2}$/.test(firstValue)) {
                currentGroup.year = select;
            }
        }
    });
    
    // Push the last group
    if (currentGroup.day || currentGroup.month || currentGroup.year) {
        dateGroups.push(currentGroup);
    }
    
    // Set up validation for each date group
    dateGroups.forEach(function(group) {
        if (group.day && group.month) {
            setupDateGroupValidation(group);
        }
    });
}

function setupDateGroupValidation(group) {
    var daySelect = group.day;
    var monthSelect = group.month;
    var yearSelect = group.year;
    
    // Skip if already set up
    if (daySelect.dataset.dateValidationSetup === 'true') {
        return;
    }
    daySelect.dataset.dateValidationSetup = 'true';
    
    function updateDayOptions() {
        var month = parseInt(monthSelect.value, 10);
        var year = yearSelect ? parseInt(yearSelect.value, 10) : new Date().getFullYear();
        
        // Handle different month value formats (0-indexed vs 1-indexed, or month names)
        // DHTMLX typically uses 0-indexed months
        if (isNaN(month)) {
            // Month might be a name, find the index
            var monthIndex = Array.prototype.findIndex.call(monthSelect.options, function(opt) {
                return opt.selected;
            });
            month = monthIndex >= 0 ? monthIndex : 0;
        }
        
        var daysInMonth = getDaysInMonth(year, month);
        var currentDay = parseInt(daySelect.value, 10);
        
        // Store current options format
        var firstOption = daySelect.options[0];
        var isZeroPadded = firstOption && firstOption.text.length === 2 && firstOption.text[0] === '0';
        var valueOffset = firstOption ? parseInt(firstOption.value, 10) : 1;
        
        // Get the current number of options
        var currentMaxDay = daySelect.options.length;
        
        if (currentMaxDay === daysInMonth) {
            // Already correct
            return;
        }
        
        // Remember selected value
        var selectedValue = daySelect.value;
        
        // Rebuild day options
        daySelect.innerHTML = '';
        for (var d = 1; d <= daysInMonth; d++) {
            var option = document.createElement('option');
            option.value = d;
            option.textContent = isZeroPadded && d < 10 ? '0' + d : String(d);
            daySelect.appendChild(option);
        }
        
        // Restore selected value if valid, otherwise select last day
        if (parseInt(selectedValue, 10) <= daysInMonth) {
            daySelect.value = selectedValue;
        } else {
            daySelect.value = daysInMonth;
        }
    }
    
    // Initial update
    updateDayOptions();
    
    // Add event listeners
    monthSelect.addEventListener('change', updateDayOptions);
    if (yearSelect) {
        yearSelect.addEventListener('change', updateDayOptions);
    }
}

// ===== KB_Sprints_Logic: Sprint selector in lightbox =====
function setupSprintSelector(retryCount) {
    retryCount = retryCount || 0;
    var lightbox = document.querySelector('.gantt_cal_light');
    if (!lightbox && retryCount < 10) {
        setTimeout(function() {
            setupSprintSelector(retryCount + 1);
        }, 50);
        return;
    }
    if (!lightbox) {
        return;
    }

    var sprintSelect = lightbox.querySelector('select[title="sprint"]');
    if (!sprintSelect) {
        if (retryCount < 10) {
            setTimeout(function() {
                setupSprintSelector(retryCount + 1);
            }, 50);
        }
        return;
    }

    var sprintOptions = getSprintOptionsForSelect();
    var shouldRebuild = sprintSelect.options.length !== sprintOptions.length;
    if (!shouldRebuild) {
        var existingOptions = Array.prototype.map.call(sprintSelect.options, function(opt) {
            return opt.value + '|' + opt.textContent;
        }).join(',');
        var desiredOptions = sprintOptions.map(function(opt) {
            return String(opt.key) + '|' + opt.label;
        }).join(',');
        shouldRebuild = existingOptions !== desiredOptions;
    }
    if (shouldRebuild) {
        sprintSelect.innerHTML = '';
        sprintOptions.forEach(function(opt) {
            var option = document.createElement('option');
            option.value = opt.key;
            option.textContent = opt.label;
            sprintSelect.appendChild(option);
        });
    }

    var taskId = gantt.getSelectedId();
    var task = taskId ? gantt.getTask(taskId) : null;
    var defaultSprintId = resolveSprintSelectionForTask(task);
    sprintSelect.value = String(defaultSprintId);
    if (task) {
        task.sprint_id = defaultSprintId;
    }

    sprintSelect.onchange = function() {
        var selectedId = parseInt(this.value, 10) || 0;
        var currentTaskId = gantt.getSelectedId();
        var currentTask = currentTaskId ? gantt.getTask(currentTaskId) : null;
        if (currentTask) {
            currentTask.sprint_id = selectedId;
            if (selectedId > 0) {
                currentTask.parent = selectedId;
            } else if (currentTask.parent && gantt.isTaskExists(currentTask.parent)) {
                var parentTask = gantt.getTask(currentTask.parent);
                if (isSprintTask(parentTask)) {
                    currentTask.parent = 0;
                }
            }
        }
    };

    var selectContainer = sprintSelect.closest('.gantt_cal_ltext') || sprintSelect.parentElement;
    if (selectContainer && !selectContainer.querySelector('.gantt-sprint-create-link')) {
        var createWrapper = document.createElement('div');
        createWrapper.className = 'gantt-sprint-create-link';
        var link = document.createElement('a');
        link.href = 'javascript:void(0)';
        link.textContent = 'Create sprint';
        link.addEventListener('click', function(evt) {
            evt.preventDefault();
            beginInlineSprintCreation();
        });
        createWrapper.appendChild(link);
        selectContainer.appendChild(createWrapper);
    }
}

function flushLightboxValuesToTask(taskId) {
    if (!taskId || typeof gantt === 'undefined' || !gantt.isTaskExists(taskId)) {
        return;
    }
    var task = gantt.getTask(taskId);
    (gantt.config.lightbox.sections || []).forEach(function(section) {
        var ctrl = gantt.getLightboxSection(section.name);
        if (!ctrl || typeof ctrl.getValue !== 'function') {
            return;
        }
        var value;
        try {
            value = ctrl.getValue();
        } catch (err) {
            console.warn('Unable to read value for section', section.name, err);
            return;
        }

        if (section.name === 'time' && value) {
            if (value.start_date) task.start_date = value.start_date;
            if (value.end_date) task.end_date = value.end_date;
            if (typeof value.duration !== 'undefined') {
                task.duration = value.duration;
            }
            return;
        }

        if (section.name === 'tasks') {
            task.child_tasks = value || [];
            return;
        }

        if (section.map_to) {
            task[section.map_to] = value;
        }
    });
    gantt.updateTask(taskId);
}

function captureInlineTaskSnapshot(task) {
    if (!task) return null;
    return {
        text: task.text,
        start_date: task.start_date ? new Date(task.start_date) : null,
        end_date: task.end_date ? new Date(task.end_date) : null,
        duration: task.duration,
        priority: task.priority,
        owner_id: task.owner_id,
        category_id: task.category_id,
        task_type: task.task_type,
        type: task.type,
        is_milestone: !!task.is_milestone,
        child_tasks: (task.child_tasks || []).slice(),
        assignee: task.assignee,
        parent: task.parent || 0,
        color: task.color,
        progress: task.progress || 0,
        sprint_id: task.sprint_id || 0
    };
}

function restoreInlineTaskSnapshot(snapshot) {
    if (!snapshot || typeof gantt === 'undefined') {
        return null;
    }
    var data = {
        text: snapshot.text,
        start_date: snapshot.start_date ? new Date(snapshot.start_date) : (snapshot.end_date ? new Date(snapshot.end_date) : new Date()),
        duration: snapshot.duration,
        priority: snapshot.priority,
        owner_id: snapshot.owner_id,
        category_id: snapshot.category_id,
        task_type: snapshot.task_type || 'task',
        type: snapshot.type || 'task',
        is_milestone: snapshot.is_milestone,
        child_tasks: (snapshot.child_tasks || []).slice(),
        assignee: snapshot.assignee,
        color: snapshot.color,
        progress: snapshot.progress || 0,
        sprint_id: snapshot.sprint_id || 0
    };
    if (snapshot.end_date) {
        data.end_date = new Date(snapshot.end_date);
    }
    var parentId = snapshot.parent || 0;
    var newId = gantt.addTask(data, parentId);
    gantt.selectTask(newId);
    if (snapshot.is_milestone) {
        var newTask = gantt.getTask(newId);
        newTask.is_milestone = true;
        newTask.type = 'task';
        gantt.updateTask(newId);
    }
    return newId;
}

function ensureInlineOriginTask(flow) {
    if (!flow) {
        return null;
    }
    if (flow.returnTaskId && gantt.isTaskExists(flow.returnTaskId)) {
        return flow.returnTaskId;
    }
    if (!flow.taskSnapshot) {
        return null;
    }
    var restoredId = restoreInlineTaskSnapshot(flow.taskSnapshot);
    flow.returnTaskId = restoredId;
    return restoredId;
}

// ===== KB_Sprints_Logic: Inline sprint creation flow =====
function beginInlineSprintCreation() {
    if (typeof gantt === 'undefined') return;
    var state = gantt.getState ? gantt.getState() : null;
    var originTaskId = state && state.lightbox ? state.lightbox : gantt.getSelectedId();
    if (!originTaskId || !gantt.isTaskExists(originTaskId)) {
        console.warn('No active task selected for sprint assignment.');
        return;
    }

    flushLightboxValuesToTask(originTaskId);
    var originTask = gantt.getTask(originTaskId);
    
    // Check if this is a new task being created (temp ID)
    var isNewTask = String(originTaskId).indexOf('$') === 0 || 
                    (typeof originTaskId === 'number' && originTaskId < 0);
    
    // For new tasks, ensure task_type is 'task' (user might have changed dropdown to see sprint options)
    if (isNewTask && originTask.task_type === 'sprint') {
        originTask.task_type = 'task';
        originTask.type = 'task';
    }
    
    var snapshot = captureInlineTaskSnapshot(originTask);
    // Force snapshot task_type to 'task' for new tasks (they're creating a task, not a sprint)
    if (isNewTask) {
        snapshot.task_type = 'task';
        snapshot.type = 'task';
    }

    var sprintData = {
        text: 'New Sprint',
        task_type: 'sprint',
        type: 'project',
        color: '#9b59b6',
        owner_id: 0,
        category_id: 0,
        child_tasks: [],
        assignee: 'Unassigned'
    };

    // Set flag to prevent onAfterLightbox from finalizing during transition
    window.__inlineSprintFlowStarting = true;
    
    window.__inlineSprintFlow = {
        returnTaskId: originTaskId,
        sprintTempId: null,
        sprintRealId: null,
        taskSnapshot: snapshot,
        pendingSprintId: null,
        pendingSprintName: null,
        sprintSaved: false  // Track if user saved (vs cancelled) the sprint
    };
    
    gantt.hideLightbox();

    var sprintId = gantt.createTask(sprintData, 0);
    window.__inlineSprintFlow.sprintTempId = sprintId;
    
    // Clear the starting flag now that sprint is created
    window.__inlineSprintFlowStarting = false;
    
    gantt.showLightbox(sprintId);
}

// ===== KB_Sprints_Logic: Finalize inline sprint creation =====
function finalizeInlineSprintFlow(closedTaskId, opts) {
    var flow = window.__inlineSprintFlow;
    if (!flow) return false;
    
    
    // Check if the sprint was saved (flag set in onLightboxSave)
    var sprintWasSaved = flow.sprintSaved === true;
    
    if (!sprintWasSaved && flow.sprintTempId) {
        // Sprint was cancelled - delete the temporary sprint task
        
        // Try to delete by temp ID (don't send to server since it was never saved)
        if (gantt.isTaskExists(flow.sprintTempId)) {
            try {
                // Use silent delete to avoid server call
                gantt.silent(function() {
                    gantt.deleteTask(flow.sprintTempId);
                });
            } catch (e) {
                console.warn('Could not delete temp sprint task:', e);
            }
        }
    } else if (sprintWasSaved) {
    }

    var restoredId = ensureInlineOriginTask(flow);
    
    if (restoredId && gantt.isTaskExists(restoredId)) {
        var restoredTask = gantt.getTask(restoredId);
        
        // ALWAYS reset to 'task' type when returning from inline sprint creation
        restoredTask.task_type = 'task';
        restoredTask.type = 'task';
        restoredTask.is_milestone = false;
        
        // Check if we have a pending sprint assignment from the async callback
        var pendingAssignment = window.__pendingSprintIdForTask;
        if (pendingAssignment && String(pendingAssignment.taskId) === String(restoredId) && pendingAssignment.sprintId) {
            restoredTask.sprint_id = pendingAssignment.sprintId;
            restoredTask.parent = pendingAssignment.sprintId;
            // DON'T clear the pending assignment yet - let resolveSprintSelectionForTask use it
            // window.__pendingSprintIdForTask = null;
        }
        
        gantt.updateTask(restoredId);
        
        // Store the task ID so we can force the type dropdown after lightbox opens
        var taskIdToRestore = restoredId;
        
        // Clear flow before showing lightbox to prevent re-triggering
        window.__inlineSprintFlow = null;
        
        // Set a flag so setupLightboxFieldToggle knows to force 'task' type
        window.__forceTaskTypeOnNextLightbox = true;
        
        // Delay opening the lightbox to give async sprint creation time to complete
        // Reset the completion flag
        window.__inlineSprintCreationComplete = false;
        
        var openLightboxForTask = function() {
            // Check again for pending assignment (in case async just completed)
            var pendingAssignment2 = window.__pendingSprintIdForTask;
            if (pendingAssignment2 && String(pendingAssignment2.taskId) === String(taskIdToRestore) && pendingAssignment2.sprintId) {
                if (gantt.isTaskExists(taskIdToRestore)) {
                    var task = gantt.getTask(taskIdToRestore);
                    task.sprint_id = pendingAssignment2.sprintId;
                    task.parent = pendingAssignment2.sprintId;
                }
            }
            
            
            // IMPORTANT: Explicitly select the task before showing lightbox
            gantt.selectTask(taskIdToRestore);
            gantt.showLightbox(taskIdToRestore);
        };
        
        // Wait for sprint creation to complete (max 2 seconds)
        var waitCount = 0;
        var maxWait = 20; // 20 * 100ms = 2 seconds max
        var waitForSprint = function() {
            waitCount++;
            if (window.__inlineSprintCreationComplete || waitCount >= maxWait) {
                openLightboxForTask();
            } else {
                setTimeout(waitForSprint, 100);
            }
        };
        
        // Start waiting
        setTimeout(waitForSprint, 100);
    } else {
        window.__inlineSprintFlow = null;
    }

    return true;
}

function getCategoryColorHex(categoryId) {
    var defaultColor = '#bdc3c7';
    var categories = window.projectCategories || [];
    var id = parseInt(categoryId, 10);
    if (!id) {
        return defaultColor;
    }
    for (var i = 0; i < categories.length; i++) {
        var entry = categories[i] || {};
        var key = typeof entry.key !== 'undefined' ? entry.key : entry.id;
        if (parseInt(key, 10) === id) {
            if (entry.color && entry.color.trim() !== '') {
                return entry.color;
            }
            break;
        }
    }
    return defaultColor;
}

// ===== KB_Task_Types: Sprint detection helper =====
function isSprintTask(task) {
    if (!task) {
        return false;
    }
    return task.task_type === 'sprint' || task.type === 'project';
}

function updateSprintListFromTasks(tasks) {
    var sprintMap = {};
    if (Array.isArray(tasks)) {
        tasks.forEach(function(task) {
            if (!task) return;
            if (isSprintTask(task)) {
                sprintMap[task.id] = task.text || ('Sprint #' + task.id);
            }
        });
    }
    window.projectSprints = Object.keys(sprintMap).map(function(id) {
        return {
            key: parseInt(id, 10),
            label: sprintMap[id]
        };
    });
    refreshSprintSectionOptions();
}

function getSprintOptionsForSelect() {
    var options = [{
        key: 0,
        label: 'No Sprint'
    }];
    (window.projectSprints || []).forEach(function(item) {
        options.push({
            key: item.key,
            label: item.label
        });
    });
    return options;
}

function refreshSprintSectionOptions() {
    if (!gantt || !gantt.config || !gantt.config.lightbox || !gantt.config.lightbox.sections) {
        return;
    }
    var sprintOptions = getSprintOptionsForSelect();
    gantt.config.lightbox.sections.forEach(function(section) {
        if (section.name === 'sprint') {
            section.options = sprintOptions;
        }
    });
}

function resolveSprintSelectionForTask(task) {
    if (!task) return 0;
    
    
    // Check for pending sprint assignment from inline sprint creation
    var pendingAssignment = window.__pendingSprintIdForTask;
    if (pendingAssignment && pendingAssignment.sprintId) {
        // Compare as strings to handle type mismatches (temp IDs are numbers, server IDs might be strings)
        var pendingTaskId = String(pendingAssignment.taskId);
        var currentTaskId = String(task.id);
        
        if (pendingTaskId === currentTaskId) {
            // Apply to task and clear pending
            task.sprint_id = pendingAssignment.sprintId;
            task.parent = pendingAssignment.sprintId;
            window.__pendingSprintIdForTask = null;
            return pendingAssignment.sprintId;
        }
    }
    
    if (task.sprint_id) {
        return parseInt(task.sprint_id, 10) || 0;
    }
    if (task.parent && typeof gantt !== 'undefined' && gantt.isTaskExists(task.parent)) {
        var parentTask = gantt.getTask(task.parent);
        if (isSprintTask(parentTask)) {
            return parentTask.id;
        }
    }
    return 0;
}

function buildSprintCreationUrl() {
    try {
        var url = new URL(window.location.href);
        url.searchParams.set('create_sprint', '1');
        return url.toString();
    } catch (err) {
        var href = window.location.href || '';
        var glue = href.indexOf('?') === -1 ? '?' : '&';
        return href + glue + 'create_sprint=1';
    }
}

// Global workload map for quick lookup
window.workloadStatusMap = {};

// Fetch project members (users and groups) for assignment dropdowns
function fetchProjectMembers(projectId) {
    var url = '?controller=TaskGanttController&action=getProjectMembers&plugin=DhtmlGantt&project_id=' + projectId;
    
    fetch(url, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(function(response) {
        return response.text(); // Get text first to debug
    })
    .then(function(text) {
        var data = JSON.parse(text);
        if (data.result === 'ok') {
            window.projectUsers = data.users;
            window.projectCategories = data.groups;  // Backend returns categories in 'groups' key
            
            // Build group member map for cascading dropdowns (keep for backward compatibility)
            window.groupMemberMap = {};
            if (data.groups) {
                data.groups.forEach(function(group) {
                    window.groupMemberMap[group.key] = group.members || [];
                });
            }
            
            // Update lightbox sections with the fetched data
            updateLightboxAssignmentOptions();
        } else {
            console.error('Failed to load project members:', data);
        }
    })
    .catch(function(error) {
        console.error('Error fetching project members:', error);
    });
}

// Update lightbox dropdown options with fetched users and groups
function updateLightboxAssignmentOptions() {
    var sections = gantt.config.lightbox.sections;
    
    for (var i = 0; i < sections.length; i++) {
        if (sections[i].name === 'category') {
            sections[i].options = window.projectCategories;
        } else if (sections[i].name === 'assignee') {
            sections[i].options = window.projectUsers;
        } else if (sections[i].name === 'sprint') {
            sections[i].options = getSprintOptionsForSelect();
        }
    }
    
}

document.addEventListener('DOMContentLoaded', function() {
    
    // Get the container element
    var container = document.getElementById('dhtmlx-gantt-chart');
    if (!container) {
        // Not on Gantt page - this is expected, skip initialization
        console.debug('Gantt container not found - skipping initialization (not on Gantt page)');
        return;
    }
    // --- Group-by dropdown: navigate with &group_by=<value> (CSP-safe) ---
    if (!window.__groupByBound) {
        window.__groupByBound = true;
        var sel = document.getElementById('group-by-select');
        if (sel) {
          var base = sel.getAttribute('data-nav-base') || '';
          sel.addEventListener('change', function () {
            try {
              var url = new URL(base, window.location.origin);
              url.searchParams.set('group_by', sel.value);
              window.location.assign(url.toString());
            } catch (e) {
              var glue = base.indexOf('?') === -1 ? '?' : '&';
              window.location.assign(base + glue + 'group_by=' + encodeURIComponent(sel.value));
            }
          });
        }
      }
    
    
    // Initialize DHtmlX Gantt
    var initialized = initDhtmlxGantt();
    
    if (!initialized) {
        console.error('Failed to initialize DHtmlX Gantt');
        return;
    }
    
    // Load task data from data attribute
    var taskDataString = container.getAttribute('data-tasks');
    // var taskData = null;
    
    // try {
    //     if (taskDataString) {
    //         taskData = JSON.parse(taskDataString);
    //     }
    // } catch (e) {
    //     console.error('Failed to parse task data:', e);
    // }
    
    // if (taskData && taskData.data && taskData.data.length > 0) {
    //     loadGanttData(taskData);
    // } else {
    //     console.warn('No task data found, loading empty chart');
    //     loadGanttData({data: [], links: []});
    // }

    // Load task data from window.taskData (set by inline script in template)

    
    try {
        if (taskDataString) {
            taskData = JSON.parse(taskDataString);
        } else {
            console.warn('No data-tasks attribute found');
        }
    } catch (e) {
        console.error('Failed to parse task data:', e);
    }
    
    if (taskData && taskData.data && taskData.data.length > 0) {
        loadGanttData(taskData);
    } else {
        console.warn('No task data found, loading empty chart');
        loadGanttData({data: [], links: []});
    }
    applyInitialGrouping();
    handleCreateSprintShortcut();

    
    // Setup URLs from data attributes
    window.ganttUrls = {
        update: container.getAttribute('data-update-url'),
        create: container.getAttribute('data-create-url'),
        remove: container.getAttribute('data-remove-url'),
        createLink: container.getAttribute('data-create-link-url'),
        removeLink: container.getAttribute('data-remove-link-url'),
        getData: container.getAttribute('data-get-data-url')  // ✅ NEW: Fast JSON refresh endpoint
    };
    
    // Fetch project members (users and groups) for assignment dropdowns
    var projectId = container.getAttribute('data-project-id');
    if (projectId) {
        fetchProjectMembers(projectId);
    }
    
    // Setup event handlers
    setupGanttEventHandlers();
});


// ===== KB_Init_Core: Base gantt config, templates, and lightbox layout =====
function initDhtmlxGantt() {
    // Check if DHtmlX Gantt library is loaded
    if (typeof gantt === 'undefined') {
        console.error('DHtmlX Gantt library not loaded!');
        return false;
    }
    
    // Check if the container element exists
    var container = document.getElementById('dhtmlx-gantt-chart');
    if (!container) {
        console.error('Gantt container element not found! Looking for #dhtmlx-gantt-chart');
        return false;
    }
    
    
    // Configure DHtmlX Gantt with NEW scale configuration format
    gantt.config.date_format = "%Y-%m-%d %H:%i";
    gantt.config.xml_date = "%Y-%m-%d %H:%i";
    
    // NEW scale configuration format (fixes deprecation warnings)
    // ✅ Apply saved zoom level from localStorage (if available)
    if (currentZoomLevel >= 0 && zoomLevels[currentZoomLevel]) {
        gantt.config.scales = zoomLevels[currentZoomLevel].scales;
    } else {
        // Default to day view (level 1)
    gantt.config.scales = [
        {unit: "week", step: 1, format: "Week #%W"},
        {unit: "day", step: 1, format: "%d %M"}
    ];
    }
    
    // Ensure grid is visible
    gantt.config.grid_width = 400;
    gantt.config.show_grid = true;
    
    // Enable plugins
    gantt.plugins({
        tooltip: true,
        keyboard_navigation: true,
        undo: true,
        grouping: true
        // NOTE: auto_scheduling is a PRO feature, not available in GPL
    });
    
    // Enable drag for links
    gantt.config.drag_links = true;
    gantt.config.show_links = true;
    
    // Configure link types
    gantt.config.types = {
        task: "task",
        project: "project",
        milestone: "milestone"
    };
    






    
    
    // Configure columns
    gantt.config.columns = [
        {name: "text", label: "Task Name", tree: true, width: 200, resize: true},
        {name: "start_date", label: "Start Date", align: "center", width: 100, resize: true},
        {name: "duration", label: "Duration", align: "center", width: 60, resize: true},
        {name: "progress", label: "Progress", align: "center", width: 80, resize: true},
        {name: "priority", label: "Priority", align: "center", width: 80, resize: true},
        {name: "add", label: "", width: 44}
    ];
    
    //new
    gantt.templates.task_class = function(start, end, task) {
        var className = "";
        
        // Milestone takes priority over other styling
        if (task.is_milestone) {
            className += "milestone-block ";
        } else if (task.task_type === 'sprint' || task.type === 'project') {
            className += "sprint-block ";
        } else if (task.priority) {
            className += "dhtmlx-priority-" + task.priority + " ";
        }
        
        if (task.readonly) {
            className += "dhtmlx-readonly ";
        }
        
        // Add workload-based border class
        var workloadClass = getWorkloadClassForTask(task);
        if (workloadClass) {
            className += workloadClass + " ";
        }
        
        return className;
    };
    
    // Progress template
    gantt.templates.progress_text = function(start, end, task) {
        return "<span>" + Math.round(task.progress * 100) + "% </span>";
    };
    
    // Task text template - show task name for regular tasks, "M" for milestones
    gantt.templates.task_text = function(start, end, task) {
        if (task.is_milestone) {
            return "M";
        }
        
        return task.text;
    };
    
    // ===== KB_Name_Display: Assignee name on right side of task bar =====
    gantt.templates.rightside_text = function(start, end, task) {
        if (task.assignee) {
            return task.assignee;
        }
        return "";
    };
    
    // Update tooltip to show category and assignee information
    // (originally lived in Assets/gantt.js as a separate extension)
    gantt.templates.tooltip_text = function(start, end, task) {
        var assigneeLabel = task.assignee || 'Unassigned';
        var categoryLabel = task.group || 'No Category';  // task.group contains category name
        var html = "";
        
        html += "<b>Task:</b> " + task.text + "<br/>";
        html += "<b>Category:</b> <span style='font-weight:bold;'>" + categoryLabel + "</span><br/>";
        html += "<b>Assigned to:</b> " + assigneeLabel + "<br/>";
        html += "<b>Start:</b> " + gantt.templates.tooltip_date_format(start) + "<br/>";
        html += "<b>End:</b> " + gantt.templates.tooltip_date_format(end) + "<br/>";
        html += "<b>Progress:</b> " + Math.round(task.progress * 100) + "%";
        
        // Preserve the \"View in Kanboard\" link behavior from Assets/gantt.js
        if (task.link) {
            html += "<br/><a href='" + task.link + "' target='_blank'>View in Kanboard</a>";
        }
        
        return html;
    };
    
    // ===== KB_Interactive_Schedule: Generic DHTMLX extensions (context menu, shortcuts) =====
    
    // Enhanced context menu: add \"View in Kanboard\" item when a task has a link
    if (gantt.ext && gantt.ext.contextmenu) {
        gantt.ext.contextmenu.attachEvent("onBeforeShow", function(id, point) {
            var task = gantt.getTask(id);
            var items = gantt.ext.contextmenu.getItems();
            
            if (task && task.link) {
                items.push({
                    text: "View in Kanboard",
                    id: "view_kanboard",
                    href: task.link,
                    target: "_blank"
                });
            }
            
            return true;
        });
    }
    
    // Keyboard shortcuts for common operations (Ctrl/Cmd + N/S/Z/Y)
    document.addEventListener('keydown', function(e) {
        if (!e.ctrlKey && !e.metaKey) {
            return;
        }
        
        switch (e.key) {
            case 'n':
                e.preventDefault();
                gantt.createTask();
                break;
            case 's':
                e.preventDefault();
                // Save all changes (if auto-save is disabled) - informational message
                if (typeof gantt.message === 'function') {
                    gantt.message("Changes saved automatically");
                }
                break;
            case 'z':
                if (gantt.ext && gantt.ext.undo) {
                    e.preventDefault();
                    gantt.ext.undo.undo();
                }
                break;
            case 'y':
                if (gantt.ext && gantt.ext.undo) {
                    e.preventDefault();
                    gantt.ext.undo.redo();
                }
                break;
        }
    });
    
    //new



    // new code for lightbox + link to kb
    // Configure lightbox sections to add "View in Kanboard" button
gantt.config.lightbox.sections = [
    {name: "type", height: 22, map_to: "task_type", type: "select", options: [
        {key: "task", label: "Task"},
        {key: "milestone", label: "Milestone"},
        {key: "sprint", label: "Sprint"}
    ]},
    {name: "description", height: 22, map_to: "text", type: "textarea", focus: true},
    {name: "tasks", height: 22, map_to: "child_tasks", type: "template", focus: true},
    {name: "category", height: 22, map_to: "category_id", type: "select", options: []},
    {name: "assignee", height: 22, map_to: "owner_id", type: "select", options: []},
    {name: "sprint", height: 22, map_to: "sprint_id", type: "select", options: []},
    {name: "priority", height: 22, map_to: "priority", type: "select", options: [
        {key: "low", label: "Low"},
        {key: "normal", label: "Normal"},
        {key: "medium", label: "Medium"},
        {key: "high", label: "High"}
    ]},
    {name: "time", type: "duration", map_to: "auto"},
    {name: "kanboard_link", height: 40, type: "template", map_to: "my_template"}
];

// Custom labels for lightbox sections
gantt.locale.labels.section_type = "Type";
gantt.locale.labels.section_tasks = "Tasks (Sprint Only)";
gantt.locale.labels.section_category = "Category";
gantt.locale.labels.section_assignee = "Assign To";
gantt.locale.labels.section_sprint = "Sprint";
gantt.locale.labels.section_kanboard_link = "Quick Actions";

// Set default values for new tasks
gantt.attachEvent("onBeforeLightbox", function(id) {
    var task = gantt.getTask(id);
    
    // Check if this is a new task (temporary ID) or existing task
    var isNewTask = (typeof id === 'string' && id.toString().indexOf('$') === 0) || 
                    (typeof id === 'number' && id < 0) ||
                    !task.id || task.id === id; // DHtmlX uses $ prefix or negative IDs for new tasks
    
    
    // Set default priority to "normal" if not already set
    if (!task.priority) {
        task.priority = "normal";
    }
    
    // Set default owner_id to 0 (unassigned) if not set
    if (task.owner_id === undefined || task.owner_id === null) {
        task.owner_id = 0;
    }
    
    // Ensure assignee label is populated
    if (!task.assignee || task.assignee === '' || task.assignee === 'Unassigned') {
        task.assignee = getUserLabelById(task.owner_id);
    }
    
    // Set default category_id to 0 if not set
    if (task.category_id === undefined || task.category_id === null) {
        task.category_id = 0;
    }
    
    // Set task_type based on existing properties
    if (!task.task_type) {
        if (task.is_milestone) {
            task.task_type = 'milestone';
        } else if (task.type === 'project') {
            task.task_type = 'sprint';
        } else {
            task.task_type = 'task';
        }
    }
    
    // Set child_tasks array if not exists
    if (!task.child_tasks) {
        task.child_tasks = [];
    }
    
    // Store isNewTask flag for later use
    task._isNewTask = isNewTask;
    
    // Add class to lightbox to control Type field visibility via CSS (no flash!)
    setTimeout(function() {
        var lightbox = document.querySelector('.gantt_cal_light');
        if (lightbox) {
            if (isNewTask) {
                lightbox.classList.add('gantt-new-task');
            } else {
                lightbox.classList.remove('gantt-new-task');
            }
        }
    }, 0); // Use 0 delay for immediate execution
    
    
    return true;
});

// Note: onAfterLightbox removed - setting the value in setupLightboxFieldToggle instead
// This avoids conflicts with the main initialization logic

// Watch for lightbox to appear and handle milestone field hiding + cascading dropdowns
var lightboxObserver = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
        mutation.addedNodes.forEach(function(node) {
            if (node.nodeType === 1 && node.classList && node.classList.contains('gantt_cal_light')) {

                // Immediately set milestone/sprint classes before delayed setup to avoid flash
                try {
                    var state = gantt.getState ? gantt.getState() : null;
                    var selectedId = (state && state.lightbox) ? state.lightbox : gantt.getSelectedId();
                    if (selectedId && gantt.isTaskExists(selectedId)) {
                        var selectedTask = gantt.getTask(selectedId);
                        if (selectedTask) {
                            if (selectedTask.is_milestone || selectedTask.task_type === 'milestone') {
                                node.classList.add('gantt-milestone-type');
                            } else {
                                node.classList.remove('gantt-milestone-type');
                            }
                            if (selectedTask.task_type === 'sprint' || selectedTask.type === 'project') {
                                node.classList.add('gantt-show-sprint-tasks');
                            } else {
                                node.classList.remove('gantt-show-sprint-tasks');
                            }
                        }
                    }
                } catch (err) {
                    console.warn('Failed to set initial lightbox classes', err);
                }
                
                // Run immediately to avoid flash, then fallback after short delay for lazy elements
                setupLightboxFieldToggle();
                setupCascadingAssignmentDropdowns();
                setupSprintSelector();
                setupDateValidation();
                setTimeout(function() {
                    setupLightboxFieldToggle();
                    setupCascadingAssignmentDropdowns();
                    setupSprintSelector();
                    setupDateValidation();
                }, 100);
            }
        });
    });
});

// Start observing the document for lightbox
lightboxObserver.observe(document.body, {
    childList: true,
    subtree: true
});

function setupLightboxFieldToggle(retryCount) {
    retryCount = retryCount || 0;
    
    var lightbox = document.querySelector('.gantt_cal_light');
    
    if (!lightbox && retryCount < 10) {
        setTimeout(function() {
            setupLightboxFieldToggle(retryCount + 1);
        }, 50);
        return;
    }
    
    if (!lightbox) {
        return;
    }
    
    
    var taskId = gantt.getSelectedId();
    var task = taskId ? gantt.getTask(taskId) : null;
    
    var typeSelect = lightbox.querySelector('select[title="type"]');
    
    if (!typeSelect) {
        if (retryCount < 10) {
            setTimeout(function() {
                setupLightboxFieldToggle(retryCount + 1);
            }, 50);
        }
        return;
    }
    
    
    // Check if we need to force 'task' type (returning from inline sprint creation)
    var forceTaskType = window.__forceTaskTypeOnNextLightbox === true;
    if (forceTaskType) {
        window.__forceTaskTypeOnNextLightbox = false;
        
        // Also update the task object to be consistent
        if (task) {
            task.task_type = 'task';
            task.type = 'task';
            task.is_milestone = false;
        }
    }
    
    // Determine the desired type value to show in the dropdown
    var desiredType = 'task';
    if (forceTaskType) {
        desiredType = 'task';
    } else if (task) {
        if (task.task_type) {
            desiredType = task.task_type;
        } else if (task.is_milestone) {
            desiredType = 'milestone';
        } else if (task.type === 'project') {
            desiredType = 'sprint';
        }
    }
    
    // Remove any existing listeners by cloning
    var newTypeSelect = typeSelect.cloneNode(true);
    
    // Ensure the select reflects the current type (task/milestone/sprint)
    newTypeSelect.value = desiredType;
    if (newTypeSelect.value !== desiredType) {
        // fallback if option not rendered yet
        console.warn('Type option not found, defaulting to "task"');
        newTypeSelect.value = 'task';
    }
    
    typeSelect.parentNode.replaceChild(newTypeSelect, typeSelect);
    typeSelect = newTypeSelect;
    
    // Function to toggle fields based on type
    var toggleFields = function() {
        var currentValue = typeSelect.value || desiredType;
        var isMilestone = currentValue === 'milestone' || (task && task.is_milestone);
        var isSprint = currentValue === 'sprint' || (task && (task.task_type === 'sprint' || task.type === 'project'));
        var isRegularTask = !isMilestone && !isSprint;
        
        
        // Scope to the lightbox markup
        var lightbox = document.querySelector('.gantt_cal_light');
        if (!lightbox) return;
        lightbox.classList.toggle('gantt-show-sprint-picker', isRegularTask);

        // Toggle sprint tasks visibility class (prevents flashing)
        if (isSprint) {
            lightbox.classList.add('gantt-show-sprint-tasks');
        } else {
            lightbox.classList.remove('gantt-show-sprint-tasks');
        }
        
        // Toggle milestone class to hide duration via CSS
        if (isMilestone) {
            lightbox.classList.add('gantt-milestone-type');
        } else {
            lightbox.classList.remove('gantt-milestone-type');
        }

        // Hide/show Priority section (select with title="priority")
        var prioritySelect = lightbox.querySelector('select[title="priority"]');
        if (prioritySelect) {
            var prContent = prioritySelect.closest('.gantt_cal_ltext') || prioritySelect.parentElement;
            var prLabel = prContent && prContent.previousElementSibling && prContent.previousElementSibling.classList && prContent.previousElementSibling.classList.contains('gantt_cal_lsection') ? prContent.previousElementSibling : null;
            if (prContent) prContent.style.display = isMilestone ? 'none' : '';
            if (prLabel) prLabel.style.display = isMilestone ? 'none' : '';
        } else {
        }
        
        // Hide/show Assign To section for sprints (sprints don't need assignees)
        var assigneeSelect = lightbox.querySelector('select[title="assignee"]');
        if (assigneeSelect) {
            var assigneeContent = assigneeSelect.closest('.gantt_cal_ltext') || assigneeSelect.parentElement;
            var assigneeLabel = assigneeContent && assigneeContent.previousElementSibling && assigneeContent.previousElementSibling.classList && assigneeContent.previousElementSibling.classList.contains('gantt_cal_lsection') ? assigneeContent.previousElementSibling : null;
            if (assigneeContent) assigneeContent.style.display = isSprint ? 'none' : '';
            if (assigneeLabel) assigneeLabel.style.display = isSprint ? 'none' : '';
            // Clear assignee for sprints
            if (isSprint) {
                assigneeSelect.value = '0';
                if (task) {
                    task.owner_id = 0;
                }
            }
        }

        // Hide/show duration section for milestones (hide entire duration bar)
        var durationCandidates = lightbox.querySelectorAll(
            '.gantt_time input[type="number"],\
             .gantt_time input[aria-label="Duration"],\
             .gantt_time input[id*="duration"],\
             .gantt_time .gantt_duration input,\
             .gantt_time .gantt_duration_value,\
             .gantt_duration_end_date'
        );
        durationCandidates.forEach(function(inp){
            if (inp && inp.style) inp.style.display = isMilestone ? 'none' : '';
            var wrap = inp.closest('.gantt_duration, .gantt_duration_line, .gantt_time_duration, .gantt_duration_end_date');
            if (wrap && wrap !== lightbox) wrap.style.display = isMilestone ? 'none' : '';
        });
        
        // Also hide the "Days" label and end date display for milestones
        var durationEndDate = lightbox.querySelector('.gantt_duration_end_date');
        if (durationEndDate) {
            durationEndDate.style.display = isMilestone ? 'none' : '';
        }

        // Toggle sprint selector visibility for regular tasks only
        var sprintSelect = lightbox.querySelector('select[title="sprint"]');
        if (sprintSelect) {
            var sprintContent = sprintSelect.closest('.gantt_cal_ltext') || sprintSelect.parentElement;
            var sprintLabel = sprintContent && sprintContent.previousElementSibling && sprintContent.previousElementSibling.classList && sprintContent.previousElementSibling.classList.contains('gantt_cal_lsection')
                ? sprintContent.previousElementSibling
                : null;
            if (sprintContent) {
                sprintContent.style.display = isRegularTask ? '' : 'none';
            }
            if (sprintLabel) {
                sprintLabel.style.display = isRegularTask ? '' : 'none';
            }
            if (!isRegularTask) {
                sprintSelect.value = '0';
                if (task) {
                    task.sprint_id = 0;
                }
            }
        }
    };
    
    // Apply on load
    toggleFields();
    
    // Apply on change
    typeSelect.addEventListener('change', function() {
        if (task) {
            var newTypeValue = typeSelect.value || 'task';
            task.task_type = newTypeValue;
            task.is_milestone = newTypeValue === 'milestone';
            if (newTypeValue === 'sprint') {
                task.type = 'project';
            } else {
                task.type = 'task';
            }
        }
        toggleFields();
    });
}

// Setup cascading dropdown logic: when group changes, filter assignee dropdown
function setupCascadingAssignmentDropdowns(retryCount) {
    retryCount = retryCount || 0;
    
    var lightbox = document.querySelector('.gantt_cal_light');
    
    if (!lightbox && retryCount < 10) {
        setTimeout(function() {
            setupCascadingAssignmentDropdowns(retryCount + 1);
        }, 50);
        return;
    }
    
    if (!lightbox) {
        return;
    }
    
    // Wait for data to be loaded
    if ((!window.projectUsers || window.projectUsers.length === 0) && retryCount < 20) {
        setTimeout(function() {
            setupCascadingAssignmentDropdowns(retryCount + 1);
        }, 100);
        return;
    }
    
    
    var taskId = gantt.getSelectedId();
    var categorySelect = lightbox.querySelector('select[title="category"]');
    var assigneeSelect = lightbox.querySelector('select[title="assignee"]');
    
    if (!categorySelect || !assigneeSelect) {
        if (retryCount < 20) {
            setTimeout(function() {
                setupCascadingAssignmentDropdowns(retryCount + 1);
            }, 50);
        }
        return;
    }
    
    
    // Manually populate the dropdowns since DHtmlX might not have done it yet
    if (categorySelect.options.length === 0 && window.projectCategories.length > 0) {
        // Add "No Category" option first
        var noCatOption = document.createElement('option');
        noCatOption.value = 0;
        noCatOption.textContent = 'No Category';
        categorySelect.appendChild(noCatOption);
        
        window.projectCategories.forEach(function(category) {
            var option = document.createElement('option');
            option.value = category.key;
            option.textContent = category.label;
            categorySelect.appendChild(option);
        });
    }
    
    if (assigneeSelect.options.length === 0 && window.projectUsers.length > 0) {
        window.projectUsers.forEach(function(user) {
            var option = document.createElement('option');
            option.value = user.key;
            option.textContent = user.label;
            assigneeSelect.appendChild(option);
        });
    }
    
    // Store the original assignee value
    var task = taskId ? gantt.getTask(taskId) : null;
    var originalAssignee = task ? (task.owner_id || 0) : 0;

    if (categorySelect) {
        categorySelect.addEventListener('change', function() {
            var selectedCategoryId = parseInt(this.value, 10) || 0;
            if (task) {
                task.category_id = selectedCategoryId;
                if (!task.is_milestone && task.task_type !== 'sprint') {
                    task.color = getCategoryColorHex(selectedCategoryId);
                    gantt.refreshTask(task.id);
                }
            }
        });
    }
    
    // Function to filter assignee dropdown based on selected category (REMOVED - categories don't have members)
    // Categories are independent of users, so no cascading logic needed
    
    /*
    // OLD CODE - kept for reference but disabled
    var filterAssignees = function() {
        var selectedGroupId = parseInt(categorySelect.value) || 0;
        
        // Get members of the selected group
        var allowedMembers = window.groupMemberMap[selectedGroupId] || [];
        
        // If "All Users" (0) is selected, show all users
        if (selectedGroupId === 0) {
            allowedMembers = window.projectUsers.map(function(u) { return u.key; });
        }
        
        
        // Clear and repopulate assignee dropdown
        assigneeSelect.innerHTML = '';
        
        window.projectUsers.forEach(function(user) {
            // Show user if they're in the allowed list or if it's the "Unassigned" option
            if (user.key === 0 || allowedMembers.indexOf(user.key) !== -1) {
                var option = document.createElement('option');
                option.value = user.key;
                option.textContent = user.label;
                assigneeSelect.appendChild(option);
            }
        });
        
        // Try to restore the original assignee if still in the list
        if (originalAssignee && allowedMembers.indexOf(originalAssignee) !== -1) {
            assigneeSelect.value = originalAssignee;
        } else {
            // Default to "Unassigned" if original assignee is not in the filtered list
            assigneeSelect.value = 0;
        }
        
    };
    
    // Set initial group based on task's assignee
    if (task && task.owner_id) {
        // Find which group contains this user
        for (var groupId in window.groupMemberMap) {
            if (window.groupMemberMap[groupId].indexOf(task.owner_id) !== -1) {
                groupSelect.value = groupId;
                break;
            }
        }
    }
    */ // End of disabled cascading logic
}

// Handle task save with sprint validation
// gantt.attachEvent("onLightboxSave", function(id, task, is_new) {
    
//     // Ensure owner_id is properly set (convert string to integer if needed)
//     if (task.owner_id !== undefined && task.owner_id !== null) {
//         task.owner_id = parseInt(task.owner_id) || 0;
//     }
    
//     // Validation: Only regular tasks must be assigned. Milestones and Sprints can be unassigned.
//     if (task.task_type === 'task' && (!task.owner_id || task.owner_id === 0)) {
//         alert('Error: Task must be assigned to a user. Please select someone from the "Assign To" dropdown.');
//         console.error('Validation failed: Task must be assigned to a user');
//         return false; // Prevent saving
//     }
    
//     // Validation: Sprints must have at least one child task
//     if (task.task_type === 'sprint' && (!task.child_tasks || task.child_tasks.length === 0)) {
//         alert('Error: Sprint must contain at least one task. Please select tasks from the "Tasks" dropdown.');
//         console.error('Validation failed: Sprint must contain at least one task');
//         return false; // Prevent saving
//     }
    
//     // Set display type and color based on task_type
//     if (task.task_type === 'sprint') {
//         task.type = "project"; // DHtmlX displays this as a parent bar
//         task.color = "#9b59b6"; // Purple color for sprints
//         task.is_milestone = false;
//     } else if (task.task_type === 'milestone') {
//         task.type = "task";
//         task.color = "#27ae60"; // Green for milestones
//         task.is_milestone = true;
//     } else {
//         task.type = "task";
//         task.is_milestone = false;
//     }
    
//     return true; // Allow saving
// });
// Handle task save with sprint validation
gantt.attachEvent("onLightboxSave", function(id, task, is_new) {
    
    // If this is an existing task (ID is a real server ID, not temporary),
    // and DHTMLX thinks it's new, we need to force it to be treated as an update
    var isRealServerId = id && typeof id === 'number' && id < 1700000000000;
    if (is_new && isRealServerId) {
        // Mark this task as needing explicit update save
        window.__forceUpdateTaskId = id;
    }
      // 🔧 FIX: force update task.task_type from UI dropdown
      var typeSection = gantt.getLightboxSection("type");
      if (typeSection && typeSection.getValue) {
          task.task_type = typeSection.getValue();
      }
      
    // --- ✨ FIX: Retrieve sprint child task selections before validation ---
    if (task.task_type === "sprint") {
        var section = gantt.getLightboxSection("tasks");
        if (section && section.getValue) {
            task.child_tasks = section.getValue(); 
        }
    }

    // Ensure owner_id is integer and update assignee label
    if (task.owner_id !== undefined && task.owner_id !== null) {
        task.owner_id = parseInt(task.owner_id) || 0;
        task.assignee = getUserLabelById(task.owner_id);
    }

    // Read sprint_id directly from DOM select (since we populate it manually via setupSprintSelector)
    var lightbox = document.querySelector('.gantt_cal_light');
    var sprintSelect = lightbox ? lightbox.querySelector('select[title="sprint"]') : null;
    if (sprintSelect) {
        var selectedSprintId = parseInt(sprintSelect.value, 10);
        if (!isNaN(selectedSprintId)) {
            task.sprint_id = selectedSprintId;
            
            // Also update the Gantt's internal task store to ensure persistence
            if (gantt.isTaskExists(id)) {
                var ganttTask = gantt.getTask(id);
                ganttTask.sprint_id = selectedSprintId;
            }
        }
    }
    // Ensure sprint_id is always defined
    if (task.sprint_id === undefined || task.sprint_id === null) {
        task.sprint_id = 0;
    }

    // Validation: Only regular tasks must be assigned
    if (task.task_type === 'task' && (!task.owner_id || task.owner_id === 0)) {
        alert('Error: Task must be assigned to a user. Please select someone from the "Assign To" dropdown.');
        console.error('Validation failed: Task must be assigned to a user');
        return false;
    }

    // Set display type and color
    if (task.task_type === 'sprint') {
        task.type = "project";
        task.color = "#9b59b6"; // Purple
        task.is_milestone = false;
    } else if (task.task_type === 'milestone') {
        task.type = "task";
        task.color = "#27ae60"; // Green
        task.is_milestone = true;
    } else {
        task.type = "task";
        task.is_milestone = false;
        task.color = getCategoryColorHex(task.category_id);
    }
    
    // Check if this is an inline sprint being saved
    if (window.__inlineSprintFlow) {
    }
    
    // Use string comparison to handle type mismatches
    var isInlineSprint = window.__inlineSprintFlow && 
                         window.__inlineSprintFlow.sprintTempId && 
                         String(window.__inlineSprintFlow.sprintTempId) === String(id);
    
    if (isInlineSprint) {
        window.__inlineSprintFlow.sprintSaved = true;
        
        // Store a local reference to the flow for the async callback
        var currentFlow = window.__inlineSprintFlow;
        var sprintTempId = id;
        
        // Explicitly read all values from lightbox sections to ensure we capture user's input
        var sprintText = task.text;
        var sprintOwnerId = task.owner_id || 0;
        var sprintCategoryId = task.category_id || 0;
        var sprintPriority = task.priority || 'normal';
        var sprintChildTasks = task.child_tasks || [];
        
        // Try to get fresh values from lightbox sections
        try {
            var descSection = gantt.getLightboxSection("description");
            if (descSection && descSection.getValue) {
                sprintText = descSection.getValue() || sprintText;
            }
            var assigneeSection = gantt.getLightboxSection("assignee");
            if (assigneeSection && assigneeSection.getValue) {
                sprintOwnerId = parseInt(assigneeSection.getValue(), 10) || 0;
            }
            var categorySection = gantt.getLightboxSection("category");
            if (categorySection && categorySection.getValue) {
                sprintCategoryId = parseInt(categorySection.getValue(), 10) || 0;
            }
            var prioritySection = gantt.getLightboxSection("priority");
            if (prioritySection && prioritySection.getValue) {
                sprintPriority = prioritySection.getValue() || 'normal';
            }
            var tasksSection = gantt.getLightboxSection("tasks");
            if (tasksSection && tasksSection.getValue) {
                sprintChildTasks = tasksSection.getValue() || [];
            }
        } catch (e) {
            console.warn('Error reading lightbox sections for inline sprint:', e);
        }
        
        // Send the sprint to the server now (since we skipped it in onAfterTaskAdd)
        var formattedStartDate = gantt.date.date_to_str(gantt.config.date_format)(task.start_date);
        var formattedEndDate = gantt.date.date_to_str(gantt.config.date_format)(task.end_date);
        
        // Store data for callback
        var returnTaskId = currentFlow.returnTaskId;
        var taskSnapshot = currentFlow.taskSnapshot;
        
        fetch(window.ganttUrls.create, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: sprintText,
                start_date: formattedStartDate,
                end_date: formattedEndDate,
                priority: sprintPriority,
                owner_id: sprintOwnerId,
                category_id: sprintCategoryId,
                task_type: 'sprint',
                child_tasks: sprintChildTasks,
                color: '#9b59b6',
                is_milestone: 0,
                sprint_id: 0
            })
        })
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data.result === 'ok' && data.id) {
                var newSprintId = data.id;
                
                // Update the task ID in Gantt
                if (gantt.isTaskExists(sprintTempId)) {
                    gantt.changeTaskId(sprintTempId, newSprintId);
                }
                
                // Add to project sprints list
                window.projectSprints = window.projectSprints || [];
                var hasExisting = window.projectSprints.some(function(entry) {
                    return parseInt(entry.key, 10) === parseInt(newSprintId, 10);
                });
                if (!hasExisting) {
                    window.projectSprints.push({
                        key: parseInt(newSprintId, 10),
                        label: sprintText || ('Sprint #' + newSprintId)
                    });
                    refreshSprintSectionOptions();
                }
                
                
                // Check if the original task was assigned to this sprint during creation
                var originalTaskWasAssigned = false;
                
                if (returnTaskId && sprintChildTasks && sprintChildTasks.length > 0) {
                    var returnTaskIdNum = parseInt(returnTaskId, 10);
                    sprintChildTasks.forEach(function(childId, idx) {
                    });
                    originalTaskWasAssigned = sprintChildTasks.some(function(childId) {
                        return parseInt(childId, 10) === returnTaskIdNum;
                    });
                }
                
                
                // Store the new sprint ID for the original task (only if it was assigned)
                if (originalTaskWasAssigned) {
                    window.__pendingSprintIdForTask = {
                        taskId: returnTaskId,
                        sprintId: newSprintId,
                        sprintName: sprintText
                    };
                } else {
                    // Still store as a "recently created sprint" so user can easily select it
                    window.__recentlyCreatedSprint = {
                        sprintId: newSprintId,
                        sprintName: sprintText
                    };
                }
                
                // Mark that async sprint creation is complete
                window.__inlineSprintCreationComplete = true;
                
                // If lightbox is already open for the original task, update the sprint dropdown
                var lightbox = document.querySelector('.gantt_cal_light');
                if (lightbox && returnTaskId) {
                    var sprintSelect = lightbox.querySelector('select[title="sprint"]');
                    if (sprintSelect) {
                        // Add the new sprint option if not already there
                        var hasOption = Array.prototype.some.call(sprintSelect.options, function(opt) {
                            return parseInt(opt.value, 10) === newSprintId;
                        });
                        if (!hasOption) {
                            var option = document.createElement('option');
                            option.value = newSprintId;
                            option.textContent = sprintText || ('Sprint #' + newSprintId);
                            sprintSelect.appendChild(option);
                        }
                        // Select the new sprint if original task was assigned to it
                        if (originalTaskWasAssigned) {
                            sprintSelect.value = String(newSprintId);
                            // Also update the task object
                            var currentTaskId = gantt.getSelectedId();
                            if (currentTaskId && gantt.isTaskExists(currentTaskId)) {
                                var currentTask = gantt.getTask(currentTaskId);
                                currentTask.sprint_id = newSprintId;
                                currentTask.parent = newSprintId;
                            }
                        }
                    }
                }
            }
        })
        .catch(function(error) {
            console.error('Error creating inline sprint:', error);
        });
    }
    
    return true; // Allow saving
});

gantt.form_blocks["template"] = {
    render: function(sns) {
        return "<div class='dhtmlx_cal_ltext' style='height:" + sns.height + "px;'></div>";
    },
    set_value: function(node, value, task, section) {
        var projectId = document.getElementById('dhtmlx-gantt-chart').getAttribute('data-project-id');
        
        // Handle Tasks multi-select (for Sprints)
        if (section.name === 'tasks') {
            node.innerHTML = '';
            // mark this content node so CSS can target it (hide/show without flash)
            node.classList.add('sprint-tasks-block');

            var isSprintTask = task && (task.task_type === 'sprint' || task.type === 'project');
            var lightboxEl = document.querySelector('.gantt_cal_light');
            if (lightboxEl) {
                lightboxEl.classList.toggle('gantt-show-sprint-tasks', !!isSprintTask);
            }
            
            // Get all tasks in the project
            var allTasks = gantt.getTaskByTime();
            var currentTaskId = task.id;
            //var selectedTasks = task.child_tasks || [];
            var selectedTasks = (task.child_tasks || []).map(v => parseInt(v));

            // expose selection to get_value
            node._selectedTasks = Array.isArray(selectedTasks) ? selectedTasks.slice() : [];
            
            // Create container
            var container = document.createElement('div');
            container.style.cssText = 'position: relative; width: 100%;';
            
            // Create search input as the main dropdown trigger
            var searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.placeholder = 'Search and select tasks...';
            // Check if dark mode is active
            var isDarkMode = document.body.classList.contains('gantt-dark-mode');
            var inputStyle = isDarkMode
                ? 'width: 100%; height: 34px; padding: 6px; border: 1px solid #3a3a3a; box-sizing: border-box; background: #1a1a1a; color: #f5f5f5;'
                : 'width: 100%; height: 34px; padding: 6px; border: 1px solid #ccc; box-sizing: border-box; background: white;';
            searchInput.style.cssText = inputStyle;
            
            // Create dropdown panel (hidden by default)
            var dropdownPanel = document.createElement('div');
            var panelStyle = isDarkMode
                ? 'display: none; position: absolute; left: 0; right: 0; width: 100%; max-height: 200px; overflow-y: auto; border: 1px solid #3a3a3a; border-top: 1px solid #3a3a3a; background: #0d0d0d; z-index: 1000; box-shadow: 0 2px 8px rgba(0,0,0,0.5);'
                : 'display: none; position: absolute; left: 0; right: 0; width: 100%; max-height: 200px; overflow-y: auto; border: 1px solid #ccc; border-top: 1px solid #ddd; background: white; z-index: 1000; box-shadow: 0 2px 8px rgba(0,0,0,0.15);';
            dropdownPanel.style.cssText = panelStyle;
            
            // Store task items for filtering
            var taskItems = [];
            var taskMap = {};
            
            if (allTasks.length === 0) {
                dropdownPanel.innerHTML = '<p style="color: #999; padding: 10px; margin: 0;">No tasks available</p>';
            } else {
                allTasks.forEach(function(t) {
                    // Don't include the current task itself or other sprints
                    if (t.id === currentTaskId || t.task_type === 'sprint') return;
                    
                    // Don't include tasks already assigned to ANOTHER sprint
                    // (but DO include tasks assigned to THIS sprint - they're already selected)
                    // Also include tasks assigned to sprints that no longer exist
                    var taskSprintId = parseInt(t.sprint_id, 10) || 0;
                    var taskParentId = parseInt(t.parent, 10) || 0;
                    var isAssignedToOtherSprint = false;
                    
                    if (taskSprintId > 0 && taskSprintId !== currentTaskId) {
                        // Task has a sprint_id that's not the current sprint
                        // But check if that sprint still exists
                        if (gantt.isTaskExists(taskSprintId)) {
                            isAssignedToOtherSprint = true;
                        } else {
                            // Sprint was deleted, this task is available
                        }
                    } else if (taskParentId > 0 && taskParentId !== currentTaskId) {
                        // Check if parent is a sprint that still exists
                        if (gantt.isTaskExists(taskParentId)) {
                            var parentTask = gantt.getTask(taskParentId);
                            if (parentTask && (parentTask.task_type === 'sprint' || parentTask.type === 'project')) {
                                isAssignedToOtherSprint = true;
                            }
                        } else {
                            // Parent sprint was deleted, this task is available
                        }
                    }
                    
                    if (isAssignedToOtherSprint) return; // Skip tasks already in another sprint
                    
                    taskMap[t.id] = t;
                    
                    var option = document.createElement('div');
                    // Use CSS classes for styling instead of inline styles
                    var borderColor = isDarkMode ? '#3a3a3a' : '#f0f0f0';
                    var textColor = isDarkMode ? '#f5f5f5' : 'inherit';
                    
                    option.className = 'sprint-task-option';
                    option.style.cssText = 'padding: 8px 12px; cursor: pointer; border-bottom: 1px solid ' + borderColor + '; color: ' + textColor + ';';
                    option.textContent = t.text + ' (' + (t.assignee || 'Unassigned') + ')';
                    option.dataset.taskId = t.id;
                    var numericId = parseInt(t.id);
                    option.dataset.taskText = t.text.toLowerCase();
                    option.dataset.taskAssignee = (t.assignee || 'unassigned').toLowerCase();
                    option.dataset.taskGroup = (t.group || 'uncategorized').toLowerCase(); // ✅ Add category for search
                    
                    if (selectedTasks.includes(numericId)) {
                        option.classList.add('selected');
                    }
                    
                    option.addEventListener('click', function() {
                        var taskId = parseInt(this.dataset.taskId);
                        var idx = selectedTasks.indexOf(taskId);
                        
                        if (idx === -1) {
                            // Add to selection
                            selectedTasks.push(taskId);
                            this.classList.add('selected');
                        } else {
                            // Remove from selection
                            selectedTasks.splice(idx, 1);
                            this.classList.remove('selected');
                        }
                        
                        // sync for get_value
                        node._selectedTasks = selectedTasks.slice();
                        updateSelectedDisplay();
                    });
                    
                    option.addEventListener('mouseover', function() {
                        if (!this.classList.contains('selected')) {
                            this.classList.add('hovered');
                        }
                    });
                    
                    option.addEventListener('mouseout', function() {
                        this.classList.remove('hovered');
                    });
                    
                    dropdownPanel.appendChild(option);
                    taskItems.push(option);
                });
            }
            
            // Open dropdown when search input is focused or clicked
            searchInput.addEventListener('focus', function() {
                dropdownPanel.style.display = 'block';
            });
            
            searchInput.addEventListener('click', function(e) {
                e.stopPropagation();
                dropdownPanel.style.display = 'block';
            });
            
            // Search functionality - filters as you type
            searchInput.addEventListener('input', function() {
                dropdownPanel.style.display = 'block'; // Open when typing
                var searchTerm = this.value.toLowerCase();
                taskItems.forEach(function(item) {
                    var taskText = item.dataset.taskText || '';
                    var taskAssignee = item.dataset.taskAssignee || '';
                    var taskGroup = item.dataset.taskGroup || ''; // ✅ Add category search
                    var matches = taskText.indexOf(searchTerm) !== -1 || 
                                  taskAssignee.indexOf(searchTerm) !== -1 || 
                                  taskGroup.indexOf(searchTerm) !== -1; // ✅ Search by category
                    item.style.display = matches ? '' : 'none';
                });
            });
            
            // Close dropdown when clicking outside
            document.addEventListener('click', function(e) {
                if (!container.contains(e.target)) {
                    dropdownPanel.style.display = 'none';
                }
            });
            
            // Selected tasks display (badges)
            var selectedDisplay = document.createElement('div');
            selectedDisplay.style.cssText = 'margin-top: 8px;';
            
            function updateSelectedDisplay() {
                selectedDisplay.innerHTML = '';
                // ensure current selection is available to get_value
                node._selectedTasks = selectedTasks.slice();
                
                // Find the parent row and lightbox for height adjustment
                var parentRow = node.closest('.gantt_cal_light_wide');
                
                if (selectedTasks.length === 0) {
                    selectedDisplay.style.display = 'none';
                    // Reset to normal height
                    if (parentRow) {
                        parentRow.style.height = 'auto';
                    }
                    node.style.height = '32px';
                } else {
                    selectedDisplay.style.display = 'block';
                    // Calculate needed height for badges
                    var badgeRows = Math.ceil(selectedTasks.length / 3);
                    var neededHeight = 32 + 8 + (badgeRows * 28); // input + gap + badges
                    
                    node.style.height = neededHeight + 'px';
                    if (parentRow) {
                        parentRow.style.height = 'auto';
                    }
                    
                    selectedTasks.forEach(function(taskId) {
                        var t = taskMap[taskId];
                        if (!t) return;
                        
                        var badge = document.createElement('span');
                        // Check if dark mode is active
                        var isDarkMode = document.body.classList.contains('gantt-dark-mode');
                        var badgeStyle = isDarkMode 
                            ? 'display: inline-block; background: #1a1a1a; color: #f5f5f5; padding: 4px 8px; margin: 2px; border-radius: 3px; font-size: 12px; border: 1px solid #3a3a3a;'
                            : 'display: inline-block; background: #2196F3; color: white; padding: 4px 8px; margin: 2px; border-radius: 3px; font-size: 12px;';
                        badge.style.cssText = badgeStyle;
                        badge.textContent = t.text;
                        
                        var removeBtn = document.createElement('span');
                        removeBtn.textContent = ' ×';
                        removeBtn.style.cssText = 'margin-left: 4px; cursor: pointer; font-weight: bold;';
                        removeBtn.addEventListener('click', function(e) {
                            e.stopPropagation();
                            var idx = selectedTasks.indexOf(taskId);
                            if (idx !== -1) {
                                selectedTasks.splice(idx, 1);
                                // sync for get_value
                                node._selectedTasks = selectedTasks.slice();
                                updateSelectedDisplay();
                                // Update option styling
                                taskItems.forEach(function(item) {
                                    if (parseInt(item.dataset.taskId) === taskId) {
                                        item.style.backgroundColor = 'transparent';
                                        item.style.fontWeight = 'normal';
                                    }
                                });
                            }
                        });
                        
                        badge.appendChild(removeBtn);
                        selectedDisplay.appendChild(badge);
                    });
                }
            }
            
            container.appendChild(searchInput);
            container.appendChild(dropdownPanel);
            container.appendChild(selectedDisplay);
            
            node.appendChild(container);
            
            // Initialize selected display
            updateSelectedDisplay();
            
            return;
        }
        
        // Handle Kanboard link button
        var taskId = task.id;
        
        // Build the Kanboard task view URL
        var taskUrl = window.location.origin + window.location.pathname.replace(/\/[^\/]*\/[^\/]*$/, '') + 
                      '?controller=TaskViewController&action=show&task_id=' + taskId + '&project_id=' + projectId;
        
        // Create button element using DOM (CSP-compliant - no inline onclick)
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'gantt_btn_set gantt_view_kanboard_btn';
        button.style.cssText = 'margin: 5px; padding: 8px 16px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;';
        button.innerHTML = '<i class="fa fa-external-link"></i> View Task in Kanboard';
        
        // Attach event listener programmatically (CSP-compliant)
        button.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            window.open(taskUrl, '_blank');
            return false;
        });
        
        // Clear node and append button
        node.innerHTML = '';
        node.appendChild(button);
    },
    get_value: function(node, task, section) {
        // Handle Tasks multi-select value retrieval
        if (section.name === 'tasks') {
            // Read the live selection stored by set_value
            var selected = node && Array.isArray(node._selectedTasks) ? node._selectedTasks : [];
            // ensure integers
            return selected.map(function(v){ return parseInt(v, 10); }).filter(function(v){ return !isNaN(v); });
        }
        return task[section.map_to];
    },
    focus: function(node) {
        // No focus needed for button
    }
};

    // new code for lightbox + link to kb

    
    // Initialize Gantt
    try {
        gantt.init("dhtmlx-gantt-chart");

        
        // ========== FIX ARROW HEADS WITH JAVASCRIPT ==========
        // Force all arrow elements to use CSS triangles instead of dots/icons
        function fixArrowHeads() {
            document.querySelectorAll('.gantt_link_arrow, div.gantt_link_arrow').forEach(function(arrow) {
                // Remove any text content or before pseudo element
                arrow.textContent = '';
                arrow.innerHTML = '';
                
                // Check if dark mode is active
                var isDarkMode = document.body.classList.contains('gantt-dark-mode');
                var arrowColor = isDarkMode ? '#ffffff' : '#4a8f43';
                
                // Force triangle styling with !important to override CSS rules
                arrow.style.setProperty('width', '0', 'important');
                arrow.style.setProperty('height', '0', 'important');
                arrow.style.setProperty('font-size', '0', 'important');
                arrow.style.setProperty('line-height', '0', 'important');
                arrow.style.setProperty('background', 'transparent', 'important');
                arrow.style.setProperty('background-color', 'transparent', 'important');
                arrow.style.setProperty('color', 'transparent', 'important');
                arrow.style.setProperty('border-style', 'solid', 'important');
                
                // Determine arrow direction and apply correct border with !important
                if (arrow.classList.contains('gantt_link_arrow_right')) {
                    arrow.style.setProperty('border-width', '7px 0 7px 10px', 'important');
                    arrow.style.setProperty('border-color', 'transparent transparent transparent ' + arrowColor, 'important');
                } else if (arrow.classList.contains('gantt_link_arrow_left')) {
                    arrow.style.setProperty('border-width', '7px 10px 7px 0', 'important');
                    arrow.style.setProperty('border-color', 'transparent ' + arrowColor + ' transparent transparent', 'important');
                } else if (arrow.classList.contains('gantt_link_arrow_down')) {
                    arrow.style.setProperty('border-width', '10px 7px 0 7px', 'important');
                    arrow.style.setProperty('border-color', arrowColor + ' transparent transparent transparent', 'important');
                } else if (arrow.classList.contains('gantt_link_arrow_up')) {
                    arrow.style.setProperty('border-width', '0 7px 10px 7px', 'important');
                    arrow.style.setProperty('border-color', 'transparent transparent ' + arrowColor + ' transparent', 'important');
                } else {
                    // Default to right arrow
                    arrow.style.setProperty('border-width', '7px 0 7px 10px', 'important');
                    arrow.style.setProperty('border-color', 'transparent transparent transparent ' + arrowColor, 'important');
                }
            });
        }

        // Run on initial load
        setTimeout(fixArrowHeads, 100);
        
        // Run after any chart updates
        gantt.attachEvent("onAfterLinkAdd", fixArrowHeads);
        gantt.attachEvent("onAfterLinkUpdate", fixArrowHeads);
        gantt.attachEvent("onAfterLinkDelete", fixArrowHeads);
        gantt.attachEvent("onDataRender", fixArrowHeads);
        gantt.attachEvent("onGanttRender", fixArrowHeads); // Also run after full render
        
        // ✅ Use MutationObserver to catch any arrow DOM changes
        var observer = new MutationObserver(function(mutations) {
            var hasArrowChanges = false;
            mutations.forEach(function(mutation) {
                if (mutation.addedNodes.length) {
                    mutation.addedNodes.forEach(function(node) {
                        if (node.nodeType === 1 && (node.classList && (node.classList.contains('gantt_link_arrow') || node.classList.contains('gantt_task_link')))) {
                            hasArrowChanges = true;
                        }
                    });
                }
            });
            if (hasArrowChanges) {
                setTimeout(fixArrowHeads, 50);
            }
        });
        
        // Observe the gantt links area
        var linksArea = document.querySelector('.gantt_links_area');
        if (linksArea) {
            observer.observe(linksArea, { childList: true, subtree: true });
        }
        
        
        // ✅ RESPONSIVE BEHAVIOR: Handle window resize
        var resizeTimeout;
        window.addEventListener('resize', function() {
            // Debounce resize events to avoid performance issues
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(function() {
                // Force DHTMLX to recalculate dimensions
                gantt.setSizes();
                gantt.render();
            }, 250);
        });
        
        // Initial sizing after initialization
        setTimeout(function() {
            gantt.setSizes();
        }, 100);
        
        // ✅ SETUP TOGGLE FOR MOVE DEPENDENCIES WITH TASK
        setupMoveDependenciesToggle();
        
        // ✅ SETUP TOGGLE FOR SHOW PROGRESS BARS
        setupShowProgressToggle();
        
        // ✅ MANUAL DEPENDENCY MOVEMENT (GPL version doesn't have auto-scheduling)
        setupManualDependencyMovement();
        
        return true;
    } catch (error) {
        console.error('Error initializing DHtmlX Gantt:', error);
        return false;
    }
}

// Global variable to track toggle state
var moveDependenciesEnabled = false;

/**
 * ✅ SETUP MOVE DEPENDENCIES TOGGLE
 * Controls whether dependencies move manually when tasks are dragged
 */
function setupMoveDependenciesToggle() {
    var toggleEl = document.getElementById('move-dependencies-toggle');
    if (!toggleEl) {
        console.warn('Move dependencies toggle not found');
        return;
    }
    
    // Restore saved preference from localStorage (default: OFF)
    var savedPref = localStorage.getItem('moveDependencies');
    if (savedPref !== null) {
        moveDependenciesEnabled = savedPref === 'true';
    } else {
        moveDependenciesEnabled = false; // Default: OFF
    }
    toggleEl.checked = moveDependenciesEnabled;
    
    // Handle toggle changes
    toggleEl.addEventListener('change', function(e) {
        moveDependenciesEnabled = e.target.checked;
        localStorage.setItem('moveDependencies', moveDependenciesEnabled);
        
        // Show feedback message
        if (typeof gantt.message === 'function') {
            gantt.message({
                text: moveDependenciesEnabled 
                    ? '✅ ON: Dependent tasks will move with this task' 
                    : '⏸️ OFF: Dependent tasks will stay in place',
                type: moveDependenciesEnabled ? 'info' : 'warning',
                expire: 3000
            });
        }
        
    });
    
}

/**
 * ✅ SETUP SHOW PROGRESS TOGGLE
 * Controls whether progress bars are visible on tasks
 */
function setupShowProgressToggle() {
    var toggleEl = document.getElementById('show-progress-toggle');
    if (!toggleEl) {
        console.warn('Show progress toggle not found');
        return;
    }
    
    // Restore saved preference from localStorage (default: ON)
    var savedPref = localStorage.getItem('showProgress');
    var showProgress = savedPref !== null ? savedPref === 'true' : true; // Default: ON
    toggleEl.checked = showProgress;
    
    // Apply initial state
    gantt.config.show_progress = showProgress;
    
    // Handle toggle changes
    toggleEl.addEventListener('change', function(e) {
        showProgress = e.target.checked;
        localStorage.setItem('showProgress', showProgress);
        gantt.config.show_progress = showProgress;
        
        // Re-render to apply changes
        gantt.render();
        
        // Show feedback message
        if (typeof gantt.message === 'function') {
            gantt.message({
                text: showProgress 
                    ? '✅ Progress bars shown' 
                    : '⏸️ Progress bars hidden',
                type: 'info',
                expire: 2000
            });
        }
        
    });
    
}

/**
 * ✅ MANUAL DEPENDENCY MOVEMENT
 * Implements dependency movement for GPL version (auto-scheduling is PRO only)
 */
function setupManualDependencyMovement() {
    var taskOriginalDates = {};
    var isMovingDependencies = false; // Flag to prevent re-entrant calls
    
    // Store original dates before drag
    gantt.attachEvent("onBeforeTaskDrag", function(id, mode, e) {
        if (!moveDependenciesEnabled || isMovingDependencies) return true;
        
        var task = gantt.getTask(id);
        taskOriginalDates[id] = {
            start: new Date(task.start_date),
            end: new Date(task.end_date)
        };
        return true;
    });
    
    // Move dependent tasks after drag completes
    gantt.attachEvent("onAfterTaskDrag", function(id, mode, e) {
        
        // Prevent re-entrant calls when we're already moving dependencies
        if (isMovingDependencies) {
            return;
        }
        
        if (!moveDependenciesEnabled || !taskOriginalDates[id]) {
            delete taskOriginalDates[id];
            return;
        }
        
        var task = gantt.getTask(id);
        var originalStart = taskOriginalDates[id].start;
        var newStart = task.start_date;
        
        // Calculate time difference
        var timeDiff = newStart - originalStart;
        
        if (timeDiff === 0) {
            delete taskOriginalDates[id];
            return;
        }
        
        
        // Set flag to prevent re-entrant calls
        isMovingDependencies = true;
        
        // Find all tasks that depend on this task (successors)
        var movedTasks = moveSuccessorTasks(id, timeDiff);
        
        // Clear flag
        isMovingDependencies = false;
        
        if (movedTasks.length > 0) {
            gantt.message({
                text: '✅ Moved ' + movedTasks.length + ' dependent task(s)',
                type: 'info',
                expire: 2000
            });
        } else {
        }
        
        delete taskOriginalDates[id];
    });
    
}

/**
 * Move all successor tasks (tasks that depend on this task)
 * @param {number} taskId - ID of the task that was moved
 * @param {number} timeDiff - Time difference in milliseconds
 * @returns {array} Array of moved task IDs
 */
function moveSuccessorTasks(taskId, timeDiff) {
    var movedTasks = [];
    var processed = {};
    var originalDates = {}; // Store original dates BEFORE any movement
    
    // First pass: Find all successors and store their original dates
    function findAllSuccessors(id) {
        if (processed[id]) return;
        processed[id] = true;
        
        var links = gantt.getLinks();
        var successors = links.filter(function(link) {
            return link.source == id;
        });
        
        successors.forEach(function(link) {
            var targetTask = gantt.getTask(link.target);
            
            // Store original dates if not already stored
            if (!originalDates[link.target]) {
                originalDates[link.target] = {
                    start: new Date(targetTask.start_date),
                    end: new Date(targetTask.end_date)
                };
            }
            
            // Recursively find successors
            findAllSuccessors(link.target);
        });
    }
    
    // Second pass: Move all successors using their stored original dates
    function moveAllSuccessors() {
        for (var taskId in originalDates) {
            var task = gantt.getTask(taskId);
            var original = originalDates[taskId];
            
            // Calculate new dates from ORIGINAL dates + offset
            var newStart = new Date(original.start.getTime() + timeDiff);
            var newEnd = new Date(original.end.getTime() + timeDiff);
            
            // Update the task silently
            task.start_date = newStart;
            task.end_date = newEnd;
            gantt.refreshTask(taskId);
            
            movedTasks.push(taskId);
        }
    }
    
    // Execute: find all, then move all
    findAllSuccessors(taskId);
    moveAllSuccessors();
    gantt.render();
    
    return movedTasks;
}

function loadGanttData(data) {
    
    // Handle both old and new data formats
    var tasks, links, resources;
    
    if (data && data.data) {
        tasks = data.data;
        links = data.links || [];
        resources = data.resources || [];
        gantt.parse({data: tasks, links: links});
    } else if (Array.isArray(data)) {
        tasks = data;
        links = [];
        resources = [];
        gantt.parse({data: tasks, links: []});
    } else {
        tasks = [];
        links = [];
        resources = [];
        gantt.parse({data: [], links: []});
    }
    
    gantt.eachTask(function (t) {
        if (t.parent === undefined || t.parent === null) {
            t.parent = 0;       // treat as top-level
        }
    });
    
    updateSprintListFromTasks(tasks || []);
    
    // Update workload panel
    updateWorkloadPanel(tasks, resources);
    
    // ✅ Auto-adjust parent durations after parsing data
    setTimeout(function() {
        recalcAllParentDurations();
    }, 100);
}

function handleCreateSprintShortcut() {
    try {
        var params = new URLSearchParams(window.location.search || '');
        if (params.get('create_sprint') === '1') {
            window.__sprintShortcutMode = true;
            setTimeout(function() {
                var initialData = {
                    text: 'New Sprint',
                    task_type: 'sprint',
                    type: 'project',
                    color: '#9b59b6',
                    child_tasks: []
                };
                var newId = gantt.createTask(initialData, 0);
                if (newId && gantt.isTaskExists(newId)) {
                    var newTask = gantt.getTask(newId);
                    newTask.task_type = 'sprint';
                    newTask.type = 'project';
                    newTask.color = '#9b59b6';
                    newTask.child_tasks = [];
                    gantt.showLightbox(newId);
                }
            }, 600);
            
            params.delete('create_sprint');
            var query = params.toString();
            var newUrl = window.location.pathname + (query ? '?' + query : '');
            window.history.replaceState({}, document.title, newUrl);
        }
    } catch (err) {
        console.warn('Failed to handle sprint shortcut', err);
    }
}

// ===== KB_Workload_Busyness: Calculate workload status per assignee =====
function calculateWorkloadStatus(tasks) {
    var workloadMap = {};
    
    tasks.forEach(function(task) {
        var ownerId = task.owner_id || 0;
        var assignee = task.assignee || 'Unassigned';
        
        if (!workloadMap[ownerId]) {
            workloadMap[ownerId] = {
                name: assignee,
                tasks: [],
                taskCount: 0
            };
        }
        
        workloadMap[ownerId].tasks.push({
            id: task.id,
            text: task.text,
            start: task.start_date,
            end: task.end_date
        });
        workloadMap[ownerId].taskCount++;
    });
    
    // Calculate workload status for each person
    var statusMap = {};
    for (var ownerId in workloadMap) {
        var person = workloadMap[ownerId];
        var status = 'workload-available';
        
        if (person.taskCount > 5) {
            status = 'workload-overloaded';
        } else if (person.taskCount > 2) {
            status = 'workload-busy';
        }
        
        statusMap[ownerId] = status;
    }
    
    // Update global map
    window.workloadStatusMap = statusMap;
    
    return workloadMap;
}

// ===== KB_Workload_Busyness: Get CSS class for task border =====
function getWorkloadClassForTask(task) {
    if (!task || !task.owner_id) return '';
    return window.workloadStatusMap[task.owner_id] || '';
}

// ===== KB_Workload_Busyness: Update workload panel display =====
function updateWorkloadPanel(tasks, resources) {
    var workloadContent = document.getElementById('workload-content');
    if (!workloadContent) return;
    
    // Calculate workload status (updates global map)
    var workloadMap = calculateWorkloadStatus(tasks);
    
    // Build HTML table
    var html = '<table class="workload-table">';
    html += '<thead><tr>';
    html += '<th>Person</th>';
    html += '<th style="text-align: center;">Task Count</th>';
    html += '<th style="text-align: center;">Workload</th>';
    html += '<th>Tasks</th>';
    html += '</tr></thead>';
    html += '<tbody>';
    
    var workloadEntries = Object.values(workloadMap);
    
    if (workloadEntries.length === 0) {
        html += '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #999;">No tasks assigned</td></tr>';
    } else {
        workloadEntries.forEach(function(person) {
            var badgeClass = 'workload-available';
            var statusText = 'Available';
            
            if (person.taskCount > 5) {
                badgeClass = 'workload-overloaded';
                statusText = 'Overloaded';
            } else if (person.taskCount > 2) {
                badgeClass = 'workload-busy';
                statusText = 'Busy';
            }
            
            html += '<tr>';
            html += '<td><strong>' + person.name + '</strong></td>';
            html += '<td style="text-align: center;"><span class="workload-badge ' + badgeClass + '">' + person.taskCount + '</span></td>';
            html += '<td style="text-align: center;"><span class="' + badgeClass + '" style="font-size: 11px;">' + statusText + '</span></td>';
            html += '<td><div class="workload-task-list">';
            
            person.tasks.forEach(function(task) {
                html += '<span class="workload-task-item">' + task.text + '</span>';
            });
            
            html += '</div></td>';
            html += '</tr>';
        });
    }
    
    html += '</tbody></table>';
    
    workloadContent.innerHTML = html;
}

//new
// Simple zoom configuration - ORIGINAL
// ✅ Restore saved zoom level from localStorage (survives page reloads)
var savedZoomLevel = localStorage.getItem('ganttZoomLevel');
var currentZoomLevel = savedZoomLevel !== null ? parseInt(savedZoomLevel, 10) : 1; // Default to day view (level 1)

var zoomLevels = [
    { name: "hour", scales: [{unit: "day", format: "%d %M"}, {unit: "hour", format: "%H"}] },
    { name: "day", scales: [{unit: "week", format: "Week #%W"}, {unit: "day", format: "%d %M"}] },
    { name: "week", scales: [{unit: "month", format: "%F"}, {unit: "week", format: "W%W"}] },
    { name: "month", scales: [{unit: "year", format: "%Y"}, {unit: "month", format: "%M"}] }
];

// ===== KB_Zoom_And_Views: Smart zoom in/out =====
function smartZoom(direction) {
    var newLevel = direction === 'in' ? 
        Math.max(0, currentZoomLevel - 1) : 
        Math.min(zoomLevels.length - 1, currentZoomLevel + 1);
    
    if (newLevel === currentZoomLevel) return;
    
    
    // Save center date to maintain position
    var scrollState = gantt.getScrollState();
    var centerDate = gantt.dateFromPos(scrollState.x + scrollState.width / 2);
    
    // Apply zoom
    gantt.config.scales = zoomLevels[newLevel].scales;
    gantt.render();
    currentZoomLevel = newLevel;
    
    // ✅ Save zoom level to localStorage so it survives page reloads
    localStorage.setItem('ganttZoomLevel', currentZoomLevel);
    
    // ✅ Clear view mode from localStorage (zoom buttons override view mode buttons)
    localStorage.removeItem('ganttViewMode');
    
    
    // Restore center position
    if (centerDate) {
        var newPos = gantt.posFromDate(centerDate);
        gantt.scrollTo(newPos - scrollState.width / 2, scrollState.y);
    }
}

// ===== KB_Zoom_And_Views: Fit-to-screen auto zoom =====
function smartFitToScreen() {
    var tasks = gantt.getTaskByTime();
    if (tasks.length === 0) {
        return;
    }
    
    // Find actual date range across all visible tasks
    var minDate = null, maxDate = null;
    tasks.forEach(function(task) {
        var start = task.start_date;
        var end = task.end_date || gantt.calculateEndDate(start, task.duration);
        if (!minDate || start < minDate) minDate = start;
        if (!maxDate || end > maxDate) maxDate = end;
    });
    
    if (!minDate || !maxDate) {
        return;
    }
    
    // Add padding (10% on each side)
    var diff = (maxDate - minDate) / 10;
    var paddedMinDate = new Date(minDate.getTime() - diff);
    var paddedMaxDate = new Date(maxDate.getTime() + diff);
    
    // Calculate best zoom level based on available space
    var container = document.getElementById('dhtmlx-gantt-chart');
    if (!container) return;
    
    var availableWidth = container.offsetWidth - (gantt.config.grid_width || 400);
    var totalDays = (paddedMaxDate - paddedMinDate) / (1000 * 60 * 60 * 24);
    var pixelsPerDay = availableWidth / totalDays;
    
    // Choose appropriate zoom level
    // hour: >100px/day, day: >30px/day, week: >10px/day, month: else
    var level;
    if (pixelsPerDay > 100) {
        level = 0; // Hour view
    } else if (pixelsPerDay > 30) {
        level = 1; // Day view
    } else if (pixelsPerDay > 10) {
        level = 2; // Week view
    } else {
        level = 3; // Month view
    }
    
    // Apply zoom level
    gantt.config.scales = zoomLevels[level].scales;
    currentZoomLevel = level;
    gantt.render();
    
    // Scroll to show the first task (left edge)
    setTimeout(function() {
        gantt.showDate(minDate);
    }, 100);
    
    // Show success message
    if (typeof gantt.message === 'function') {
        gantt.message({
            text: '📐 Fit to screen: ' + zoomLevels[level].name + ' view',
            type: 'info',
            expire: 2000
        });
    }
}
//new

/**
 * ✅ ADJUST SPRINT DURATION based on child tasks
 * Only applies to sprints (task_type === 'sprint' or type === 'project')
 * Regular parent-child tasks do NOT auto-adjust
 */
function recalcParentDuration(childTask) {
    if (!childTask || !childTask.parent) return;

    var parentId = childTask.parent;
    var parent = gantt.getTask(parentId);
    if (!parent) return;
    
    // ✅ ONLY adjust duration for SPRINTS, not regular parent tasks
    var isSprint = parent.task_type === 'sprint' || parent.type === 'project';
    if (!isSprint) {
        return;
    }

    // Gather all direct children of the sprint
    var children = gantt.getChildren(parentId).map(function(id) {
        return gantt.getTask(id);
    });

    if (children.length === 0) return;

    // Compute earliest start and latest end among children
    var minStart = children[0].start_date;
    var maxEnd = children[0].end_date;
    for (var i = 1; i < children.length; i++) {
        var c = children[i];
        if (c.start_date < minStart) minStart = c.start_date;
        if (c.end_date > maxEnd) maxEnd = c.end_date;
    }

    // Update sprint start/end based on new bounds
    var changed = false;
    if (+minStart !== +parent.start_date) {
        parent.start_date = new Date(minStart);
        changed = true;
    }
    if (+maxEnd !== +parent.end_date) {
        parent.end_date = new Date(maxEnd);
        changed = true;
    }

    if (changed) {
        gantt.refreshTask(parentId);
        gantt.updateTask(parentId);
    }
}

/**
 * ✅ RECALCULATE ALL SPRINT DURATIONS after data load
 * Only adjusts sprints, not regular parent tasks
 */
function recalcAllParentDurations() {
    gantt.eachTask(function(task) {
        if (task.parent) {
            var parent = gantt.getTask(task.parent);
            // Only recalc if parent is a sprint
            if (parent && (parent.task_type === 'sprint' || parent.type === 'project')) {
                recalcParentDuration(task);
            }
        }
    });
    gantt.render();
}

function setupGanttEventHandlers() {
    // Bind once guard
    if (window.__ganttHandlersBound) {
        return;
    }
    window.__ganttHandlersBound = true;

    // de-duped toast helper (global-ish)
    if (!window.singleToast) {
        let __lastToast = { text: "", at: 0 };
        window.singleToast = function(text) {
            const now = Date.now();
            if (text === __lastToast.text && now - __lastToast.at < 1000) return;
            __lastToast = { text, at: now };
            gantt.message({ type: "warning", text, expire: 1500 });
        };
    }
    // Data processor for CRUD operations - URLs will be set by template
    if (typeof window.ganttUrls !== 'undefined' && window.ganttUrls.update) {
        
        // Use simplified event-based approach instead of data processor
        // ---- same-level rule helpers ----
    function _parentOf(task){
        return (task && task.parent != null && task.parent !== undefined) ? task.parent : 0;
    }
    function _sameLevelAllowed(a, b){
        const pa = _parentOf(a);
        const pb = _parentOf(b);
        // allowed: both top-level OR both children of the same parent
        return (pa === 0 && pb === 0) || (pa !== 0 && pa === pb);
    }
    
    // ===== KB_Task_Dependencies: Link validation (same-level, circular, sprint rules) =====
    
    // Check for circular dependency (A→B and B→A)
    function _isCircularLink(link) {
        var links = gantt.getLinks();
        for (var i = 0; i < links.length; i++) {
            var l = links[i];
            if (String(l.source) === String(link.target) &&
                String(l.target) === String(link.source)) {
                return true;
            }
        }
        return false;
    }
    
    // dhtmlx built-in validator (runs before adding the link)
    gantt.attachEvent("onLinkValidation", function(link){
        const s = gantt.getTask(link.source);
        const t = gantt.getTask(link.target);
        
        // Rule 1: Prevent sprints from being linked (source or target)
        if (s.task_type === 'sprint' || t.task_type === 'sprint') {
            singleToast("Sprints cannot be linked to other tasks");
            return false;
        }
        
        // Rule 2: Same-level check
        const ok = _sameLevelAllowed(s, t);
        if (!ok) {
            singleToast("Rule: only siblings or top-level tasks can be linked.");
            return false;
        }
        
        // Rule 3: Circular dependency check
        if (_isCircularLink(link)) {
            singleToast("Circular dependency detected");
            return false;
        }
        
        return true;
      });
    
        // Handle task creation
        gantt.attachEvent("onAfterTaskAdd", function(id, task) {
            
            // Check if this is actually an existing task that DHTMLX mistakenly thinks is new
            // (This happens after the inline sprint flow)
            if (window.__forceUpdateTaskId === id) {
                window.__forceUpdateTaskId = null;
                
                // Send to update endpoint instead
                var formattedStartDate = gantt.date.date_to_str(gantt.config.date_format)(task.start_date);
                var formattedEndDate = gantt.date.date_to_str(gantt.config.date_format)(task.end_date);
                
            fetch(window.ganttUrls.update, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: id,
                        text: task.text,
                        start_date: formattedStartDate,
                        end_date: formattedEndDate,
                        priority: task.priority || 'normal',
                        owner_id: task.owner_id || 0,
                        category_id: task.category_id || 0,
                        task_type: task.task_type || 'task',
                        color: task.color || null,
                        child_tasks: task.child_tasks || [],
                        is_milestone: task.is_milestone ? 1 : 0,
                        progress: task.progress || 0,
                        sprint_id: task.sprint_id || 0
                    })
                })
                .then(response => response.json())
                .then(data => {
                })
                .catch(error => {
                    console.error('Error forcing update for task:', error);
                });
                
                return; // Don't proceed with CREATE logic
            }
            
            // Check if this is an inline sprint creation in progress
            // If so, don't send to server yet - wait for user to save or cancel
            if (window.__inlineSprintFlow && window.__inlineSprintFlow.sprintTempId === id) {
                // Don't mark as successfully created yet - wait for actual save
                // Don't send to server yet
                return;
            }
            
            // Mark this task as successfully created (used by onAfterLightbox to decide whether to remove unsaved tasks)
            successfullyCreatedTaskIds[id] = true;
            
            // Apply color based on type
            if (task.is_milestone) {
                task.color = "#27ae60";
            } else if (task.task_type === 'sprint') {
                task.color = "#9b59b6";
            } else {
                task.color = getCategoryColorHex(task.category_id);
            }
            
            // Ensure assignee label is set
            task.assignee = getUserLabelById(task.owner_id);
            
            // Update workload
            updateWorkloadPanel(gantt.getTaskByTime(), []);
            
            // ✅ Check if this is a subtask (has a parent)
            var parentTaskId = task.parent;
            var isSubtask = parentTaskId && parentTaskId !== 0 && parentTaskId !== '0';
            
            if (isSubtask) {
            }
            
            // Send create request to server including all fields
            // ✅ Format dates as strings to preserve exact time
            var formattedStartDate = gantt.date.date_to_str(gantt.config.date_format)(task.start_date);
            var formattedEndDate = gantt.date.date_to_str(gantt.config.date_format)(task.end_date);
            
            
            fetch(window.ganttUrls.create, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: task.text,
                    start_date: formattedStartDate,
                    end_date: formattedEndDate,
                    priority: task.priority || 'normal',
                    owner_id: task.owner_id || 0,
                    category_id: task.category_id || 0,  // ✅ FIX: Include category_id
                    task_type: task.task_type || 'task',
                    child_tasks: task.child_tasks || [],
                    color: task.color || null,
                    is_milestone: task.is_milestone ? 1 : 0,
                    sprint_id: task.sprint_id || 0
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.result === 'ok' && data.id) {
                    // Update the task ID in Gantt with the server-assigned ID
                    gantt.changeTaskId(id, data.id);
                    
                    if (task.task_type === 'sprint') {
                        window.projectSprints = window.projectSprints || [];
                        var hasExisting = window.projectSprints.some(function(entry) {
                            return parseInt(entry.key, 10) === parseInt(data.id, 10);
                        });
                        if (!hasExisting) {
                            window.projectSprints.push({
                                key: parseInt(data.id, 10),
                                label: task.text || ('Sprint #' + data.id)
                            });
                            refreshSprintSectionOptions();
                        }
                    }
                    
                    if (window.__inlineSprintFlow && window.__inlineSprintFlow.sprintTempId === id) {
                        window.__inlineSprintFlow.sprintRealId = data.id;
                        window.__inlineSprintFlow.sprintTempId = data.id;
                        window.__inlineSprintFlow.pendingSprintId = data.id;
                        window.__inlineSprintFlow.pendingSprintName = task.text;
                    }
                    
            // ✅ If this is a subtask, create the internal link "is a child of"
                    if (isSubtask) {
                        
                        fetch(window.ganttUrls.createLink, {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({
                                source: data.id,     // Child task (the new subtask)
                                target: parentTaskId, // Parent task
                                type: 'child'        // 'child' = "is a child of" in Kanboard
                            })
                        })
                        .then(response => response.json())
                        .then(linkData => {
                            if (linkData.result !== 'ok') {
                                console.error('Failed to create internal link:', linkData.message);
                            }
                        })
                        .catch(error => {
                            console.error('Error creating internal link:', error);
                        });
                    }

                    if (window.__sprintShortcutMode && window.opener && !window.opener.closed && task.task_type === 'sprint') {
                        try {
                            window.opener.postMessage({
                                type: 'sprintCreated',
                                sprint: {
                                    id: data.id,
                    text: task.text
                                }
                            }, window.location.origin || '*');
                        } catch (postErr) {
                            console.warn('Failed to notify opener about sprint creation', postErr);
                        }
                        window.__sprintShortcutMode = false;
                        setTimeout(function() {
                            window.close();
                        }, 400);
                    }
                } else {
                    console.error('Failed to create task:', data.message);
                }
            })
            .catch(error => {
                console.error('Error creating task:', error);
            });
        });
        
        // ✅ Track tasks that need to be saved after auto-scheduling completes
        var tasksToSave = {};
        var saveTimeout = null;
        
        gantt.attachEvent("onAfterTaskUpdate", function(id, task) {
        
            // // If this is a parent task, do NOT allow it to be shorter than its children.
            // var childIds = gantt.getChildren(id);
            // if (childIds && childIds.length > 0) {
            //     var minChildStart = null;
            //     var maxChildEnd = null;
        
            //     childIds.forEach(function(cid) {
            //         var c = gantt.getTask(cid);
            //         if (!minChildStart || c.start_date < minChildStart) minChildStart = c.start_date;
            //         var cEnd = c.end_date || gantt.calculateEndDate(c.start_date, c.duration);
            //         if (!maxChildEnd || cEnd > maxChildEnd) maxChildEnd = cEnd;
            //     });
        
            //     // Detect invalid shrink: parent starts after earliest child OR ends before latest child
            //     var invalid =
            //         (minChildStart && task.start_date > minChildStart) ||
            //         (maxChildEnd   && task.end_date   < maxChildEnd);
        
            //     if (invalid) {
            //         // Toast + revert visually to span children; DO NOT save to backend
            //         if (window.singleToast) {
            //             window.singleToast("Parent cannot be shorter than its child tasks.");
            //         } else if (gantt.message) {
            //             gantt.message({ type: "warning", text: "Parent cannot be shorter than its child tasks.", expire: 1500 });
            //         }
        
            //         // Snap parent back to fully cover children
            //         if (minChildStart) task.start_date = new Date(minChildStart);
            //         if (maxChildEnd)   task.end_date   = new Date(maxChildEnd);
            //         task.duration = gantt.calculateDuration(task.start_date, task.end_date);
        
            //         gantt.refreshTask(id);
            //         // IMPORTANT: skip enqueueing save for this task
            //         return true; // exit handler early
            //     }
            // }
        
            // Keep your milestone color tweak
            if (task.is_milestone) {
                task.color = "#27ae60";
                gantt.refreshTask(id);
            } else if (task.task_type === 'sprint') {
                task.color = "#9b59b6";
            } else {
                task.color = getCategoryColorHex(task.category_id);
            }
        
            // If this task has a parent, recalc that parent's span (unchanged behavior)
            if (task.parent) {
                recalcParentDuration(task);
                gantt.refreshTask(task.parent, true);
            }
        
            // Queue save to backend - include all fields with time precision formatting
            var sprintIdToSave = task.sprint_id;
            // Also check if we have it stored in a temporary property (set during lightbox save)
            if (sprintIdToSave === undefined || sprintIdToSave === null) {
                sprintIdToSave = 0;
            }
            sprintIdToSave = parseInt(sprintIdToSave, 10) || 0;
            
            
            tasksToSave[id] = {
                id: id,
                text: task.text,
                start_date: gantt.date.date_to_str(gantt.config.date_format)(task.start_date),
                end_date:   gantt.date.date_to_str(gantt.config.date_format)(task.end_date),
                priority: task.priority,
                owner_id: task.owner_id || 0,
                category_id: task.category_id || 0,
                task_type: task.task_type || 'task',
                color: task.color || null,
                child_tasks: task.child_tasks || [],
                is_milestone: task.is_milestone ? 1 : 0,
                progress: task.progress || 0,
                sprint_id: sprintIdToSave
            };
            
            // Debounce: wait for auto-scheduling to complete before saving
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(function() {
                saveQueuedTasks();
            }, 500);
        });
        
        // Track tasks that were successfully created (not just saved attempt)
        var successfullyCreatedTaskIds = {};
        
        // Handle lightbox close (any way it closes)
        gantt.attachEvent("onAfterLightbox", function(closedTaskId) {
            
            // Skip if we're in the middle of starting the inline sprint flow
            // (hideLightbox triggers this before we create the sprint task)
            if (window.__inlineSprintFlowStarting) {
                return true;
            }
            
            if (window.__inlineSprintFlow && window.__inlineSprintFlow.sprintTempId) {
                // Only finalize if the sprint task was actually created
                finalizeInlineSprintFlow(closedTaskId);
            } else if (closedTaskId) {
                // Check if this is a temporary task that wasn't successfully created
                var isNewTask = isTemporaryTaskId(closedTaskId);
                var wasSuccessfullyCreated = successfullyCreatedTaskIds[closedTaskId];
                
                if (isNewTask && !wasSuccessfullyCreated && gantt.isTaskExists(closedTaskId)) {
                    // Use setTimeout to avoid issues with Gantt's internal state
                    setTimeout(function() {
                        if (gantt.isTaskExists(closedTaskId)) {
                            gantt.deleteTask(closedTaskId);
                        }
                    }, 50);
                }
                
                // Clean up tracking
                delete successfullyCreatedTaskIds[closedTaskId];
            }
            return true;
        });

        // Handle cancel button specifically
        gantt.attachEvent("onLightboxCancel", function(taskId) {
            
            // Skip if we're in the middle of starting the inline sprint flow
            if (window.__inlineSprintFlowStarting) {
                return true;
            }
            
            if (window.__inlineSprintFlow && window.__inlineSprintFlow.sprintTempId) {
                // Only finalize if the sprint task was actually created
                setTimeout(function() {
                    finalizeInlineSprintFlow(taskId);
                }, 10);
            }
            // Note: Unsaved task cleanup is handled by onAfterLightbox
            return true;
        });
        
        // Helper function to check if task ID is temporary (new/unsaved)
        function isTemporaryTaskId(taskId) {
            if (!taskId) return false;
            var idStr = String(taskId);
            // DHTMLX Gantt uses $ prefix for temporary tasks, or negative numbers
            return idStr.indexOf('$') === 0 || 
                   (typeof taskId === 'number' && taskId < 0) ||
                   idStr.startsWith('new_');
        }
        

        
        // Save all queued tasks at once
        function saveQueuedTasks() {
            if (Object.keys(tasksToSave).length === 0) return;
            
            
            // Collect all save promises
            var savePromises = [];
            
            // Save each task
            for (var taskId in tasksToSave) {
                var taskData = tasksToSave[taskId];
                
                var savePromise = fetch(window.ganttUrls.update, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(taskData)
            })
            .then(response => response.json())
            .then(data => {
                if (data.result !== 'ok') {
                    console.error('Failed to save task:', data.message);
                        return false;
                }
                    return true;
            })
            .catch(error => {
                console.error('Error saving task:', error);
                    return false;
                });
                
                savePromises.push(savePromise);
            }
            
            // Clear the queue
            tasksToSave = {};
            
            // ✅ After all saves complete, refresh the chart to show updated colors
            Promise.all(savePromises).then(function(results) {
                var allSuccessful = results.every(function(r) { return r === true; });
                
                // DON'T auto-refresh if inline sprint flow is active
                // (refreshing would destroy the temporary sprint task)
                if (window.__inlineSprintFlow) {
                    updateWorkloadPanel(gantt.getTaskByTime(), []);
                    return;
                }
                
                // DON'T auto-refresh if lightbox is open (would reset user's changes)
                var lightboxOpen = document.querySelector('.gantt_cal_light');
                if (lightboxOpen) {
                    updateWorkloadPanel(gantt.getTaskByTime(), []);
                    return;
                }
                
                if (allSuccessful) {
                    // Small delay to ensure backend has processed everything
                    setTimeout(function() {
                        reloadGanttDataFromServer();
                    }, 300);
                }
                
                updateWorkloadPanel(gantt.getTaskByTime(), []);
            });
        }
        
        // Handle task deletion
        gantt.attachEvent("onBeforeTaskDelete", function(id, task) {
            
            // If this is a sprint being deleted, release all child tasks first
            var isSprintTask = task && (task.task_type === 'sprint' || task.type === 'project');
            var childTaskIds = [];
            var childTasksData = []; // Store full task data to restore if needed
            
            if (isSprintTask) {
                // Get all children of this sprint BEFORE any deletion happens
                var children = gantt.getChildren(id);
                
                // First, collect all child data
                children.forEach(function(childId) {
                    if (gantt.isTaskExists(childId)) {
                        var childTask = gantt.getTask(childId);
                        childTaskIds.push(childId);
                        // Store full task data in case we need to restore
                        childTasksData.push({
                            id: childId,
                            text: childTask.text,
                            start_date: new Date(childTask.start_date),
                            end_date: new Date(childTask.end_date),
                            duration: childTask.duration,
                            progress: childTask.progress || 0,
                            priority: childTask.priority,
                            owner_id: childTask.owner_id,
                            category_id: childTask.category_id,
                            task_type: childTask.task_type,
                            color: childTask.color,
                            assignee: childTask.assignee,
                            is_milestone: childTask.is_milestone
                        });
                    }
                });
                
                // Now update each child to have parent = 0 using silent mode
                // This prevents DHTMLX from deleting them with the parent
                gantt.batchUpdate(function() {
                    children.forEach(function(childId) {
                        if (gantt.isTaskExists(childId)) {
                            var childTask = gantt.getTask(childId);
                            childTask.parent = 0;
                            childTask.sprint_id = 0;
                            gantt.updateTask(childId);
                        }
                    });
                });
                
                // Store for after-delete restoration
                window.__releasedChildTasks = {
                    sprintId: id,
                    tasks: childTasksData,
                    taskIds: childTaskIds
                };
            }
            
            // Send delete request to server
            fetch(window.ganttUrls.remove, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    id: id
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.result !== 'ok') {
                    console.error('Failed to delete task:', data.message);
                } else {
                    // Update the released child tasks on the server
                    if (childTaskIds.length > 0) {
                        childTaskIds.forEach(function(childId) {
                            if (gantt.isTaskExists(childId)) {
                                var childTask = gantt.getTask(childId);
                                var formattedStartDate = gantt.date.date_to_str(gantt.config.date_format)(childTask.start_date);
                                var formattedEndDate = gantt.date.date_to_str(gantt.config.date_format)(childTask.end_date);
                                
                                fetch(window.ganttUrls.update, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        id: childId,
                                        text: childTask.text,
                                        start_date: formattedStartDate,
                                        end_date: formattedEndDate,
                                        priority: childTask.priority || 'normal',
                                        owner_id: childTask.owner_id || 0,
                                        category_id: childTask.category_id || 0,
                                        task_type: childTask.task_type || 'task',
                                        color: childTask.color || null,
                                        child_tasks: [],
                                        is_milestone: childTask.is_milestone ? 1 : 0,
                                        progress: childTask.progress || 0,
                                        sprint_id: 0  // Clear the sprint assignment
                                    })
                                })
                                .then(function(r) { return r.json(); })
                                .then(function(d) {
                                });
                            }
                        });
                    }
                    
                    // Update workload after successful deletion
                    setTimeout(function() {
                        updateWorkloadPanel(gantt.getTaskByTime(), []);
                    }, 100);
                }
            })
            .catch(error => {
                console.error('Error deleting task:', error);
            });
            
            // Return true to allow the deletion in the UI
            return true;
        });
        
        // Handle after task deletion - restore child tasks if they were removed
        gantt.attachEvent("onAfterTaskDelete", function(id, task) {
            
            // Check if we have released child tasks to restore
            if (window.__releasedChildTasks && window.__releasedChildTasks.sprintId === id) {
                var releasedData = window.__releasedChildTasks;
                
                // Check each child task - if it no longer exists, re-add it
                releasedData.tasks.forEach(function(taskData) {
                    if (!gantt.isTaskExists(taskData.id)) {
                        
                        // Re-add the task with parent = 0
                        gantt.addTask({
                            id: taskData.id,
                            text: taskData.text,
                            start_date: taskData.start_date,
                            end_date: taskData.end_date,
                            duration: taskData.duration,
                            progress: taskData.progress,
                            priority: taskData.priority,
                            owner_id: taskData.owner_id,
                            category_id: taskData.category_id,
                            task_type: taskData.task_type,
                            color: taskData.color,
                            assignee: taskData.assignee,
                            is_milestone: taskData.is_milestone,
                            sprint_id: 0,
                            parent: 0,
                            type: 'task'
                        });
                    } else {
                        // Task still exists, just make sure it's updated
                        var existingTask = gantt.getTask(taskData.id);
                        existingTask.parent = 0;
                        existingTask.sprint_id = 0;
                        gantt.updateTask(taskData.id);
                    }
                });
                
                // Clear the stored data
                window.__releasedChildTasks = null;
                
                // Refresh to show the restored tasks
                gantt.render();
            }
        });
        
        // Prevent infinite loops
        var isProcessingLink = false;
        
        // Handle dependency creation when user draws arrows in Gantt
        gantt.attachEvent("onAfterLinkAdd", function(id, link) {
            
            // Prevent infinite loop
            if (isProcessingLink) {
                return;
            }
            isProcessingLink = true;
            
            // Send dependency to server using fetch API
            fetch(window.ganttUrls.createLink, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    source: link.source,
                    target: link.target,
                    type: link.type
                })
            })
            .then(response => {
                return response.text(); // Get as text first to see what we're getting
            })
            .then(text => {
                try {
                    const data = JSON.parse(text);
                    if (data.result !== 'ok') {
                        console.error('Failed to create dependency:', data.message);
                        // ⚠️ FIX: Remove link WITHOUT triggering events to prevent infinite loop
                        gantt.silent(function() {
                            gantt.deleteLink(id);
                        });
                        isProcessingLink = false; // Reset flag
                        return;
                    }
                    // ✅ SUCCESS: Reload fresh data from server to reflect changes
                    reloadGanttDataFromServer();
                    isProcessingLink = false; // Reset flag
                } catch (parseError) {
                    console.error('JSON parse error:', parseError);
                    console.error('Response was not valid JSON:', text);
                    // Remove the link WITHOUT triggering events
                    gantt.silent(function() {
                        gantt.deleteLink(id);
                    });
                    isProcessingLink = false; // Reset flag
                }
            })
            .catch(error => {
                console.error('Error creating dependency:', error);
                // Remove the link WITHOUT triggering events
                gantt.silent(function() {
                    gantt.deleteLink(id);
                });
                isProcessingLink = false; // Reset flag
            });
        });

        // Handle dependency removal when user deletes arrows in Gantt  
        gantt.attachEvent("onAfterLinkDelete", function(id, link) {
            
            // Prevent processing during link creation cleanup
            if (isProcessingLink) {
                return;
            }
            
            
            // Use the actual database ID from the link object, not the DHTMLX internal ID
            var databaseId = link.id || id;
            
            // Ensure we have a valid integer ID for the database
            var linkIdForServer = parseInt(databaseId, 10);
            
            // Check if this looks like a DHTMLX internal ID (very large number)
            if (isNaN(linkIdForServer) || linkIdForServer <= 0 || linkIdForServer > 1000000) {
                return; // Don't send request for internal IDs or invalid IDs
            }
            
            
            // Send removal request to server using fetch API
            fetch(window.ganttUrls.removeLink, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    id: linkIdForServer,
                    source: link.source,
                    target: link.target
                })
            })
            .then(response => {
                return response.text(); // Get as text first to handle both JSON and HTML responses
            })
            .then(text => {
                try {
                    const data = JSON.parse(text);
                    if (data.result === 'ok') {
                        
                        // ⚠️ FORCE REMOVAL: Sometimes DHTMLX doesn't remove the visual arrow properly
                        // So we need to force remove it and refresh the chart
                        
                        // Try to remove the link from DHTMLX if it still exists
                        if (gantt.isLinkExists(linkIdForServer)) {
                            gantt.deleteLink(linkIdForServer);
                        }
                        
                        // ✅ DYNAMIC SOLUTION: Reload fresh data from server
                        reloadGanttDataFromServer();
                        
                        return; // Exit early
                    } else {
                        console.error('Failed to remove dependency:', data.message);
                        // ⚠️ FIX: Don't restore link - let the UI removal stand
                        // The link probably didn't exist in database anyway
                        return;
                    }
                } catch (parseError) {
                    console.error('JSON parse error:', parseError);
                    console.error('Response was not valid JSON:', text);
                    
                    // ⚠️ FIX: Don't restore link on parse errors either  
                    // Most parse errors happen because the link wasn't in the database
                    return; // Exit early, don't refresh
                }
            })
            .catch(error => {
                console.error('Error removing dependency:', error);
                // ⚠️ FIX: Don't restore on network errors either
            });
        });
        
        
    } else {
        console.warn('No ganttUrls found, data processor not initialized');
    }
    
    // Note: recalcParentDuration and recalcAllParentDurations moved to global scope

/**
 * ✅ DYNAMIC DATA RELOAD FUNCTION - FAST JSON ENDPOINT
 * Reloads fresh data from server to ensure chart is always in sync (NO PAGE RELOAD!)
 */
function reloadGanttDataFromServer() {
    
    // ✅ Save current zoom level, column width, and scroll position before reload
    var savedZoomLevel = currentZoomLevel;
    var savedMinColumnWidth = gantt.config.min_column_width;
    var savedScrollState = gantt.getScrollState();
    
    
    // ✅ Use dedicated JSON endpoint URL from data attribute
    var dataUrl = window.ganttUrls && window.ganttUrls.getData;
    
    if (!dataUrl) {
        console.error('❌ No getData URL configured!');
        fallbackRefresh();
        return;
    }
    
    
    // Make FAST JSON request (no HTML parsing needed!)
    fetch(dataUrl, {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache'
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('HTTP ' + response.status + ': ' + response.statusText);
        }
        return response.json();
    })
    .then(freshTaskData => {
        
        // Update cached data
        window.taskData = freshTaskData;
        
        // Clear and reload chart with fresh data
        gantt.clearAll();
        loadGanttData(freshTaskData);
        
        // ✅ Restore zoom level and column width after reload
        if (typeof savedZoomLevel === 'number' && savedZoomLevel >= 0 && zoomLevels[savedZoomLevel]) {
            gantt.config.scales = zoomLevels[savedZoomLevel].scales;
            currentZoomLevel = savedZoomLevel;
        }
        
        // ✅ Restore min_column_width (critical for Month view)
        if (savedMinColumnWidth) {
            gantt.config.min_column_width = savedMinColumnWidth;
        }
        
        gantt.render(); // Re-render with all saved settings
        
        // ✅ Restore scroll position after a short delay
        setTimeout(function() {
            if (savedScrollState) {
                gantt.scrollTo(savedScrollState.x, savedScrollState.y);
            }
        }, 100);
        
    })
    .catch(error => {
        console.error('❌ Fast JSON reload failed:', error);
        console.warn('⚠️ Falling back to slow full page reload...');
        fallbackRefresh();
    });
}

/**
 * Fallback refresh method when server reload fails
 */
function fallbackRefresh() {
    console.warn('⚠️ reloadGanttDataFromServer() FAILED - Using fallback: full page reload');
    console.warn('📌 View mode will be restored from localStorage after reload');
    // As last resort, reload the entire page to get fresh data
    // (View mode is saved in localStorage so it will be restored)
    window.location.reload();
    }
    
    // Toolbar event handlers
    var addTaskBtn = document.getElementById('dhtmlx-add-task');
    if (addTaskBtn) {
        addTaskBtn.addEventListener('click', function() {
            gantt.createTask();
        });
    }
    
    // var zoomInBtn = document.getElementById('dhtmlx-zoom-in');
    // if (zoomInBtn) {
    //     zoomInBtn.addEventListener('click', function() {
    //         if (gantt.ext && gantt.ext.zoom) {
    //             gantt.ext.zoom.zoomIn();
    //         }
    //     });
    // }
    
    // var zoomOutBtn = document.getElementById('dhtmlx-zoom-out');
    // if (zoomOutBtn) {
    //     zoomOutBtn.addEventListener('click', function() {
    //         if (gantt.ext && gantt.ext.zoom) {
    //             gantt.ext.zoom.zoomOut();
    //         }
    //     });
    // }
    
    // var fitBtn = document.getElementById('dhtmlx-fit');
    // if (fitBtn) {
    //     fitBtn.addEventListener('click', function() {
    //         if (gantt.ext && gantt.ext.zoom) {
    //             gantt.ext.zoom.setLevel("month");
    //         }
    //     });
    // }


    // Enhanced zoom handlers
    var zoomInBtn = document.getElementById('dhtmlx-zoom-in');
    if (zoomInBtn) {
        zoomInBtn.addEventListener('click', function() {
        smartZoom('in');
        });
    }
    
    var zoomOutBtn = document.getElementById('dhtmlx-zoom-out');
    if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', function() {
            smartZoom('out');
        });
    }

    // ✅ Group by dropdown handler
    var groupByDropdown = document.getElementById('dhtmlx-group-by');
    if (groupByDropdown) {
        groupByDropdown.addEventListener('change', function() {
            var mode = this.value;
            
            // ✅ ALWAYS clear grouping first before applying new one
            // This ensures originalTasks is properly restored
            if (originalTasks) {
                clearGrouping();
            }
            
            if (mode === 'none') {
                // Already cleared above, just keep it cleared
            } else if (mode === 'assignee') {
                groupByAssignee();
            } else if (mode === 'group') {
                groupByUserGroup();
            } else if (mode === 'sprint') {
                groupBySprint();
            }
        });
    }
    
    // ===== KB_DarkMode_Styling: Dark mode toggle button handler =====
    var darkModeToggleBtn = document.getElementById('dhtmlx-dark-mode-toggle');
    if (darkModeToggleBtn) {
        // Restore saved dark mode preference
        var savedDarkMode = localStorage.getItem('ganttDarkMode');
        if (savedDarkMode === 'true') {
            document.body.classList.add('gantt-dark-mode');
            darkModeToggleBtn.querySelector('i').className = 'fa fa-sun-o';
        }
        
        darkModeToggleBtn.addEventListener('click', function() {
            var icon = this.querySelector('i');
            
            if (document.body.classList.contains('gantt-dark-mode')) {
                // Switch to light mode
                document.body.classList.remove('gantt-dark-mode');
                icon.className = 'fa fa-moon-o';
                localStorage.setItem('ganttDarkMode', 'false');
            } else {
                // Switch to dark mode
                document.body.classList.add('gantt-dark-mode');
                icon.className = 'fa fa-sun-o';
                localStorage.setItem('ganttDarkMode', 'true');
            }
            
            // Re-render gantt to apply styles
            gantt.render();
            
            // ✅ Fix arrows after dark mode toggle
            setTimeout(fixArrowHeads, 200);
        });
    }
    
    // ✅ Expand/Collapse toggle button
    var expandToggleBtn = document.getElementById('dhtmlx-expand-toggle');
    if (expandToggleBtn) {
        expandToggleBtn.addEventListener('click', function() {
            var currentState = this.getAttribute('data-state');
            var icon = this.querySelector('i');
            
            if (currentState === 'collapsed') {
                // Expand all tasks
                gantt.eachTask(function(task) {
                    task.$open = true;
                });
                gantt.render();
                
                // Update button to show "Collapse All"
                this.setAttribute('data-state', 'expanded');
                this.setAttribute('title', 'Collapse All');
                icon.className = 'fa fa-compress';
                
            } else {
                // Collapse all tasks
                gantt.eachTask(function(task) {
                    task.$open = false;
                });
                gantt.render();
                
                // Update button to show "Expand All"
                this.setAttribute('data-state', 'collapsed');
                this.setAttribute('title', 'Expand All');
                icon.className = 'fa fa-expand';
                
            }
        });
    }
    
    // View mode buttons - add delay to ensure DOM is ready
    setTimeout(function() {
        const viewButtons = document.querySelectorAll('.btn-dhtmlx-view');
        
        viewButtons.forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                const view = this.getAttribute('data-view');
                
                // Remove active class from all buttons
                document.querySelectorAll('.btn-dhtmlx-view').forEach(function(b) {
                    b.classList.remove('active');
                });
                // Add active class to clicked button
                this.classList.add('active');
                
                // Change view mode
                changeViewMode(view);
            });
        });
        
        // ✅ Restore saved view mode from localStorage (survives page reloads)
        // But only if zoom level is NOT saved (zoom buttons take precedence)
        var savedZoomFromStorage = localStorage.getItem('ganttZoomLevel');
        var savedViewMode = localStorage.getItem('ganttViewMode');
        
        if (!savedZoomFromStorage && savedViewMode) {
            changeViewMode(savedViewMode);
            // Mark the correct button as active
            viewButtons.forEach(function(btn) {
                if (btn.getAttribute('data-view') === savedViewMode) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        } else if (savedZoomFromStorage) {
        }
    }, 100);
    
    // Statistics removed - no longer displayed

    // Toggle resource/workload view button handler
    var toggleResourcesBtn = document.getElementById('dhtmlx-toggle-resources');
    if (toggleResourcesBtn) {
        var resourcesVisible = false; // Start hidden by default
        
        toggleResourcesBtn.addEventListener('click', function() {
            var workloadPanel = document.getElementById('workload-panel');
            
            if (workloadPanel) {
                resourcesVisible = !resourcesVisible;
                
                if (resourcesVisible) {
                    // Show workload panel
                    workloadPanel.classList.remove('hidden');
                    this.classList.add('active');
                } else {
                    // Hide workload panel
                    workloadPanel.classList.add('hidden');
                    this.classList.remove('active');
                }
            }
        });
    }

    // ✅ Settings Dropdown Handler with localStorage persistence
    var settingsBtn = document.getElementById('dhtmlx-settings-btn');
    var settingsMenu = document.getElementById('dhtmlx-settings-menu');
    
    if (settingsBtn && settingsMenu) {
        // Toggle dropdown visibility
        settingsBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            var isVisible = settingsMenu.style.display === 'block';
            settingsMenu.style.display = isVisible ? 'none' : 'block';
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', function(e) {
            if (!settingsBtn.contains(e.target) && !settingsMenu.contains(e.target)) {
                settingsMenu.style.display = 'none';
            }
        });
        
        // Initialize settings from localStorage
        var moveDepsToggle = document.getElementById('move-dependencies-toggle');
        var showProgressToggle = document.getElementById('show-progress-toggle');
        var showBusynessToggle = document.getElementById('show-busyness-toggle');
        
        // Load saved states from localStorage (defaults: move=false, progress=true, busyness=true)
        var savedMoveDeps = localStorage.getItem('ganttMoveDependencies');
        var savedProgress = localStorage.getItem('ganttShowProgress');
        var savedBusyness = localStorage.getItem('ganttShowBusyness');
        
        if (moveDepsToggle) {
            moveDepsToggle.checked = savedMoveDeps === 'true';
            gantt.config.auto_scheduling = moveDepsToggle.checked;
            gantt.config.auto_scheduling_strict = moveDepsToggle.checked;
            gantt.config.auto_scheduling_compatibility = moveDepsToggle.checked;
        }
        
        if (showProgressToggle) {
            showProgressToggle.checked = savedProgress !== 'false'; // Default true
            gantt.config.show_progress = showProgressToggle.checked;
        }
        
        if (showBusynessToggle) {
            showBusynessToggle.checked = savedBusyness !== 'false'; // Default true
            var ganttContainer = document.getElementById('dhtmlx-gantt-chart');
            if (ganttContainer) {
                if (showBusynessToggle.checked) {
                    ganttContainer.classList.remove('hide-busyness-borders');
                } else {
                    ganttContainer.classList.add('hide-busyness-borders');
                }
            }
        }
        
        // Handle Move Dependencies toggle
        if (moveDepsToggle) {
            moveDepsToggle.addEventListener('change', function() {
                gantt.config.auto_scheduling = this.checked;
                gantt.config.auto_scheduling_strict = this.checked;
                gantt.config.auto_scheduling_compatibility = this.checked;
                localStorage.setItem('ganttMoveDependencies', this.checked);
            });
        }
        
        // Handle Show Progress toggle
        if (showProgressToggle) {
            showProgressToggle.addEventListener('change', function() {
                gantt.config.show_progress = this.checked;
                localStorage.setItem('ganttShowProgress', this.checked);
                gantt.render();
            });
        }
        
        // Handle Show Busyness toggle
        if (showBusynessToggle) {
            showBusynessToggle.addEventListener('change', function() {
                var ganttContainer = document.getElementById('dhtmlx-gantt-chart');
                if (ganttContainer) {
                    if (this.checked) {
                        ganttContainer.classList.remove('hide-busyness-borders');
                    } else {
                        ganttContainer.classList.add('hide-busyness-borders');
                    }
                    localStorage.setItem('ganttShowBusyness', this.checked);
                    gantt.render();
                }
            });
        }
    }

}

// ===== KB_Zoom_And_Views: Day/Week/Month view mode =====
function changeViewMode(mode) {
    // Save view mode to localStorage so it survives page reloads
    localStorage.setItem('ganttViewMode', mode);
    
    // ✅ Clear zoom level from localStorage (view mode buttons override zoom buttons)
    localStorage.removeItem('ganttZoomLevel');
    currentZoomLevel = 1; // Reset to default
    
    // Use NEW scale configuration format
    switch(mode) {
        case 'Day':
            gantt.config.scales = [
                {unit: "day", step: 1, format: "%d %M"},
                {unit: "hour", step: 6, format: "%H:%i"}
            ];
            gantt.config.min_column_width = 250; // ✅ Shows ~2 days
            break;
        case 'Week':
            gantt.config.scales = [
                {unit: "week", step: 1, format: "Week #%W"},
                {unit: "day", step: 1, format: "%d %M"}
            ];
            gantt.config.min_column_width = 100; // ✅ Shows ~2 weeks
            break;
        case 'Month':
            gantt.config.scales = [
                {unit: "month", step: 1, format: "%F %Y"},
                {unit: "day", step: 1, format: "%d"}
            ];
            gantt.config.min_column_width = 25; // ✅ Shows ~2 months (less crowded dates)
            break;
    }
    gantt.render();
}



//new
var originalTasks = null; // Store original task data

// ===== KB_Grouping_Assignee: Group tasks by assignee =====
function groupByAssignee() {
    
    // Store original tasks if not already stored
    if (!originalTasks) {
        originalTasks = gantt.serialize();
    }
    
    // Get all tasks
    var tasks = gantt.getTaskByTime();
    var groups = {};
    var groupedData = [];
    var groupIdCounter = 10000; // Start group IDs at a high number to avoid conflicts
    
    // Group tasks by assignee
    tasks.forEach(function(task) {
        var assignee = task.assignee || 'Unassigned';
        if (!groups[assignee]) {
            groups[assignee] = {
                id: groupIdCounter++,
                text: assignee,
                start_date: task.start_date,
                duration: 0,
                progress: 0,
                type: 'project', // Make it a project/group
                open: true,
                assignee: assignee,
                tasks: []
            };
        }
        groups[assignee].tasks.push(task);
    });
    
    // Build grouped structure
    for (var assignee in groups) {
        var group = groups[assignee];
        var minDate = null;
        var maxDate = null;
        var totalProgress = 0;
        
        // Calculate group properties
        group.tasks.forEach(function(task) {
            if (!minDate || task.start_date < minDate) {
                minDate = task.start_date;
            }
            var taskEnd = task.end_date || gantt.calculateEndDate(task.start_date, task.duration);
            if (!maxDate || taskEnd > maxDate) {
                maxDate = taskEnd;
            }
            totalProgress += task.progress;
        });
        
        group.start_date = minDate;
        group.end_date = maxDate;
        group.duration = gantt.calculateDuration(minDate, maxDate);
        group.progress = totalProgress / group.tasks.length;
        
        // Add group
        groupedData.push({
            id: group.id,
            text: group.text + ' (' + group.tasks.length + ' tasks)',
            start_date: gantt.date.date_to_str(gantt.config.date_format)(group.start_date),
            duration: group.duration,
            progress: group.progress,
            type: 'project',
            open: true,
            parent: 0  // ✅ Explicitly set parent to 0 to avoid cycles
        });
        
        // Add tasks under group
        group.tasks.forEach(function(task) {
            groupedData.push({
                id: task.id,
                text: task.text,
                start_date: gantt.date.date_to_str(gantt.config.date_format)(task.start_date),
                end_date: gantt.date.date_to_str(gantt.config.date_format)(task.end_date || gantt.calculateEndDate(task.start_date, task.duration)),
                duration: task.duration,
                progress: task.progress,
                priority: task.priority,
                color: task.color,
                parent: group.id, // Set parent to group
                assignee: task.assignee
            });
        });
    }
    
    // Clear and reload with grouped data
    gantt.clearAll();
    gantt.parse({data: groupedData, links: []});
    
}

// ===== KB_Grouping_Category: Group tasks by category (user group) =====
function groupByUserGroup() {
    // Store original tasks if not already stored
    if (!originalTasks) {
        originalTasks = gantt.serialize();
    }
    
    // Get all tasks
    var tasks = gantt.getTaskByTime();
    var groups = {};
    var groupedData = [];
    var groupIdCounter = 10000; // Start group IDs at a high number to avoid conflicts
    
    // Group tasks by user group
    tasks.forEach(function(task) {
        var userGroup = task.group || 'Ungrouped';
        if (!groups[userGroup]) {
            groups[userGroup] = {
                id: groupIdCounter++,
                text: userGroup,
                start_date: task.start_date,
                duration: 0,
                progress: 0,
                type: 'project', // Make it a project/group
                open: true,
                group: userGroup,
                tasks: []
            };
        }
        groups[userGroup].tasks.push(task);
    });
    
    // Build grouped structure (same logic as groupByAssignee)
    for (var userGroup in groups) {
        var group = groups[userGroup];
        var minDate = null;
        var maxDate = null;
        var totalProgress = 0;
        
        // Calculate group properties
        group.tasks.forEach(function(task) {
            if (!minDate || task.start_date < minDate) {
                minDate = task.start_date;
            }
            var taskEnd = task.end_date || gantt.calculateEndDate(task.start_date, task.duration);
            if (!maxDate || taskEnd > maxDate) {
                maxDate = taskEnd;
            }
            totalProgress += task.progress;
        });
        
        group.start_date = minDate;
        group.end_date = maxDate;
        group.duration = gantt.calculateDuration(minDate, maxDate);
        group.progress = totalProgress / group.tasks.length;
        
        // Add group header
        groupedData.push({
            id: group.id,
            text: group.text + ' (' + group.tasks.length + ' tasks)',
            start_date: gantt.date.date_to_str(gantt.config.date_format)(group.start_date),
            duration: group.duration,
            progress: group.progress,
            type: 'project',
            open: true,
            parent: 0  // ✅ Explicitly set parent to 0 to avoid cycles
        });
        
        // Add tasks under group
        group.tasks.forEach(function(task) {
            groupedData.push({
                id: task.id,
                text: task.text,
                start_date: gantt.date.date_to_str(gantt.config.date_format)(task.start_date),
                end_date: gantt.date.date_to_str(gantt.config.date_format)(task.end_date || gantt.calculateEndDate(task.start_date, task.duration)),
                duration: task.duration,
                progress: task.progress,
                priority: task.priority,
                color: task.color,
                parent: group.id, // Set parent to group
                group: task.group
            });
        });
    }
    
    // Clear and reload with grouped data
    gantt.clearAll();
    gantt.parse({data: groupedData, links: []});
    
}

// ===== KB_Grouping_Sprint: Group tasks by sprint =====
function groupBySprint() {
    // Store original tasks if not already stored
    if (!originalTasks) {
        originalTasks = gantt.serialize();
    }
    
    // Get all tasks
    var tasks = gantt.getTaskByTime();
    var sprintTasks = {};  // Map of sprint_id to sprint task
    var childTasksBySprintId = {}; // Map of sprint_id to child tasks
    var orphanTasks = []; // Tasks without a sprint
    var groupedData = [];
    
    // First pass: identify sprint tasks and group children
    tasks.forEach(function(task) {
        // Check if this task IS a sprint
        if (task.task_type === 'sprint') {
            sprintTasks[task.id] = task;
            if (!childTasksBySprintId[task.id]) {
                childTasksBySprintId[task.id] = [];
            }
        }
    });
    
    // Second pass: assign tasks to their sprints
    tasks.forEach(function(task) {
        // Skip sprint tasks themselves
        if (task.task_type === 'sprint') return;
        
        // Check if task belongs to a sprint via sprint_id
        var sprintId = task.sprint_id || 0;
        if (sprintId && sprintTasks[sprintId]) {
            if (!childTasksBySprintId[sprintId]) {
                childTasksBySprintId[sprintId] = [];
            }
            childTasksBySprintId[sprintId].push(task);
        } else if (task.parent && sprintTasks[task.parent]) {
            // Check if parent is a sprint
            if (!childTasksBySprintId[task.parent]) {
                childTasksBySprintId[task.parent] = [];
            }
            childTasksBySprintId[task.parent].push(task);
        } else {
            // Task has no sprint
            orphanTasks.push(task);
        }
    });
    
    // Build grouped structure - add sprints with their children
    for (var sprintId in sprintTasks) {
        var sprint = sprintTasks[sprintId];
        var children = childTasksBySprintId[sprintId] || [];
        
        // Add sprint header
        groupedData.push({
            id: sprint.id,
            text: sprint.text + ' (' + children.length + ' tasks)',
            start_date: gantt.date.date_to_str(gantt.config.date_format)(sprint.start_date),
            end_date: sprint.end_date ? gantt.date.date_to_str(gantt.config.date_format)(sprint.end_date) : null,
            duration: sprint.duration,
            progress: sprint.progress || 0,
            type: 'project',
            open: true,
            parent: 0,
            color: '#9b59b6',
            task_type: 'sprint'
        });
        
        // Add child tasks under sprint
        children.forEach(function(task) {
            groupedData.push({
                id: task.id,
                text: task.text,
                start_date: gantt.date.date_to_str(gantt.config.date_format)(task.start_date),
                end_date: task.end_date ? gantt.date.date_to_str(gantt.config.date_format)(task.end_date) : null,
                duration: task.duration,
                progress: task.progress,
                priority: task.priority,
                color: task.color,
                parent: sprint.id,
                task_type: task.task_type
            });
        });
    }
    
    // Add orphan tasks under "No Sprint" group if there are any
    if (orphanTasks.length > 0) {
        var noSprintGroupId = 99999;
        groupedData.push({
            id: noSprintGroupId,
            text: 'No Sprint (' + orphanTasks.length + ' tasks)',
            start_date: gantt.date.date_to_str(gantt.config.date_format)(orphanTasks[0].start_date),
            duration: 1,
            progress: 0,
            type: 'project',
            open: true,
            parent: 0,
            color: '#95a5a6'
        });
        
        orphanTasks.forEach(function(task) {
            groupedData.push({
                id: task.id,
                text: task.text,
                start_date: gantt.date.date_to_str(gantt.config.date_format)(task.start_date),
                end_date: task.end_date ? gantt.date.date_to_str(gantt.config.date_format)(task.end_date) : null,
                duration: task.duration,
                progress: task.progress,
                priority: task.priority,
                color: task.color,
                parent: noSprintGroupId,
                task_type: task.task_type
            });
        });
    }
    
    // Clear and reload with grouped data
    gantt.clearAll();
    gantt.parse({data: groupedData, links: []});
}

function clearGrouping() {
    
    if (originalTasks) {
        gantt.clearAll();
        gantt.parse(originalTasks);
        originalTasks = null;
    }
    
}
// ===== KB_Grouping_Assignee / KB_Grouping_Category / KB_Grouping_Sprint: Initial grouping =====
function applyInitialGrouping() {
    if (typeof gantt === 'undefined' || !gantt.groupBy) return;
  
    var container = document.getElementById('dhtmlx-gantt-chart');
    var mode = (container && container.getAttribute('data-group-by')) || 'none';
  
    if (mode === 'none') {
      gantt.groupBy(false); // clear grouping
    } else if (mode === 'assignee' || mode === 'group' || mode === 'sprint') {
      gantt.groupBy({
        relation_property: mode,  // task.assignee / task.group / task.sprint
        default_group_label: '—'
      });
    }
}

// ===== KB_Utilities: General-purpose helpers (highlight, stats, auto-refresh) =====
window.KanboardGantt = {
    /**
     * Highlight tasks matching a criteria function
     * @param {Function} criteria - function(task) returning true to highlight
     */
    highlightTasks: function(criteria) {
        gantt.eachTask(function(task) {
            var element = gantt.getTaskNode(task.id);
            if (element) {
                if (criteria(task)) {
                    element.classList.add('dhtmlx-highlighted');
                } else {
                    element.classList.remove('dhtmlx-highlighted');
                }
            }
        });
    },
    
    /**
     * Get project statistics (total, completed, in-progress, not-started, overdue)
     * @returns {Object} stats object
     */
    getProjectStats: function() {
        var stats = {
            total: 0,
            completed: 0,
            inProgress: 0,
            notStarted: 0,
            overdue: 0
        };
        
        var now = new Date();
        
        gantt.eachTask(function(task) {
            stats.total++;
            
            if (task.progress >= 1) {
                stats.completed++;
            } else if (task.progress > 0) {
                stats.inProgress++;
            } else {
                stats.notStarted++;
            }
            
            if (task.end_date && new Date(task.end_date) < now && task.progress < 1) {
                stats.overdue++;
            }
        });
        
        return stats;
    },
    
    /**
     * Setup periodic auto-refresh from server
     * @param {number} intervalMinutes - refresh interval in minutes (0 to disable)
     */
    setupAutoRefresh: function(intervalMinutes) {
        if (intervalMinutes > 0) {
            setInterval(function() {
                if (typeof reloadGanttDataFromServer === 'function') {
                    reloadGanttDataFromServer();
                } else {
                    gantt.clearAll();
                    gantt.load(window.location.href);
                }
            }, intervalMinutes * 60000);
        }
    }
};
