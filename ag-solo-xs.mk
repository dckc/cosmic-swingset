export MODDABLE := $(HOME)/projects/moddable
export PATH := $(MODDABLE)/build/bin/lin/release:$(PATH)

PKG=cosmic-swingset

MODE=debug
BASEDIR=t3
do-build:
	mcconfig -d -p x-cli-lin ag-solo-xs-manifest.json
	cd $(MODDABLE)/build/tmp/lin/$(MODE)/$(PKG) && $(MAKE)
	$(MODDABLE)/build/bin/lin/$(MODE)/$(PKG) $(BASEDIR)

clean:
	-rm -rf $(MODDABLE)/build/tmp/lin/release/$(PKG)
	-rm -f $(MODDABLE)/build/bin/lin/release/$(PKG)
	-rm -rf $(MODDABLE)/build/tmp/lin/debug/$(PKG)
	-rm -f $(MODDABLE)/build/bin/lin/debug/$(PKG)
