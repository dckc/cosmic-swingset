export MODDABLE := $(HOME)/projects/moddable
export PATH := $(MODDABLE)/build/bin/lin/release:$(PATH)

PKG=cosmic-swingset


BASEDIR=t3
release-build:
	mcconfig -p x-cli-lin ag-solo-xs-manifest.json
	cd $(MODDABLE)/build/tmp/lin/release/$(PKG) && $(MAKE)
	$(MODDABLE)/build/bin/lin/release/$(PKG) $(BASEDIR)

debug-build:
	mcconfig -d -p lin -m ag-solo-xs-manifest.json

clean:
	-rm -rf $(MODDABLE)/build/tmp/lin/release/$(PKG)
	-rm -f $(MODDABLE)/build/bin/lin/release/$(PKG)
	-rm -rf $(MODDABLE)/build/tmp/lin/debug/$(PKG)
	-rm -f $(MODDABLE)/build/bin/lin/debug/$(PKG)
