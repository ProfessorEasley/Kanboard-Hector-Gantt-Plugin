plugin := DhtmlGantt
version := 1.0.0

all:
	@ echo "Hector Gantt Plugin v$(version)"
	@ echo "Available targets:"
	@ echo "- archive: Create release archive"
	@ echo "- install: Install to Kanboard (set KANBOARD_DIR)"

archive:
	@ echo "Creating archive for $(plugin) v$(version)"
	@ git archive HEAD --prefix=$(plugin)/ --format=zip -o HectorGantt-$(version).zip
	@ echo "Archive created: HectorGantt-$(version).zip"

install:
	@ echo "Installing $(plugin) to Kanboard"
	@ if [ -d "$(KANBOARD_DIR)" ]; then \
		cp -r . $(KANBOARD_DIR)/plugins/$(plugin)/; \
		chmod -R 755 $(KANBOARD_DIR)/plugins/$(plugin)/; \
		echo "Plugin installed to $(KANBOARD_DIR)/plugins/$(plugin)/"; \
		echo "Enable it in Settings → Plugins"; \
	else \
		echo "KANBOARD_DIR not set."; \
		echo "Usage: make install KANBOARD_DIR=/path/to/kanboard"; \
	fi

.PHONY: all archive install
