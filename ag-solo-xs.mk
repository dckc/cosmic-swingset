export MODDABLE := $(HOME)/projects/moddable
export PATH := $(MODDABLE)/build/bin/lin/release:$(PATH)

PKG=cosmic-swingset

do-build:
	mcconfig -p x-cli-lin ag-solo-xs-manifest.json
	cd $(MODDABLE)/build/tmp/lin/release/$(PKG) && $(MAKE)
	$(MODDABLE)/build/bin/lin/release/$(PKG) arg1 arg2

clean:
	-rm -r $(MODDABLE)/build/tmp/lin/release/$(PKG)
	-rm $(MODDABLE)/build/bin/lin/release/$(PKG)
